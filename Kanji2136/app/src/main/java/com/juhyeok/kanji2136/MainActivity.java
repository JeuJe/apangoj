package com.juhyeok.kanji2136;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

public class MainActivity extends Activity implements PurchasesUpdatedListener {

    private static final String PREMIUM_PRODUCT_ID = "premium_lifetime";
    private static final String PREFS = "kanji2136_store";
    private static final String PREF_PREMIUM = "premium_cached";
    private static final String FALLBACK_PRICE = "₩12,000";

    private WebView webView;
    private FrameLayout adContainer;

    private BillingClient billingClient;
    private ProductDetails premiumProductDetails;
    private boolean premium;
    private String premiumPrice = FALLBACK_PRICE;

    private ConsentInformation consentInformation;
    private boolean adsInitialized = false;
    private AdView bannerAd;
    private InterstitialAd interstitialAd;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        premium = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_PREMIUM, false);
        webView = findViewById(R.id.webView);
        adContainer = findViewById(R.id.adContainer);

        configureWebView();
        setupBilling();
        requestAdConsent();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new StoreBridge(), "AndroidStore");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                notifyPremiumState();
            }
        });
        webView.loadUrl("file:///android_asset/web/index.html");
    }

    private void setupBilling() {
        billingClient = BillingClient.newBuilder(this)
                .setListener(this)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder()
                                .enableOneTimeProducts()
                                .build()
                )
                .build();

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    queryPremiumProduct();
                    queryOwnedPurchases(false);
                } else {
                    sendPurchaseMessage("Google Play 결제 연결에 실패했습니다.");
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // 다음 앱 재개 시 reconnectBillingIfNeeded()에서 다시 연결합니다.
            }
        });
    }

    private void reconnectBillingIfNeeded() {
        if (billingClient == null || billingClient.isReady()) return;
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    queryPremiumProduct();
                    queryOwnedPurchases(false);
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
            }
        });
    }

    private void queryPremiumProduct() {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PREMIUM_PRODUCT_ID)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, result) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
            List<ProductDetails> products = result.getProductDetailsList();
            if (products.isEmpty()) return;

            premiumProductDetails = products.get(0);
            List<ProductDetails.OneTimePurchaseOfferDetails> offers = premiumProductDetails.getOneTimePurchaseOfferDetailsList();
            if (offers != null && !offers.isEmpty()) {
                premiumPrice = offers.get(0).getFormattedPrice();
            } else if (premiumProductDetails.getOneTimePurchaseOfferDetails() != null) {
                premiumPrice = premiumProductDetails.getOneTimePurchaseOfferDetails().getFormattedPrice();
            }
            notifyPremiumState();
        });
    }

    private void launchPremiumPurchase() {
        if (premium) {
            sendPurchaseMessage("이미 프리미엄이 활성화되어 있습니다.");
            return;
        }
        if (billingClient == null || !billingClient.isReady()) {
            reconnectBillingIfNeeded();
            sendPurchaseMessage("Google Play 결제 서비스에 연결 중입니다. 잠시 후 다시 눌러주세요.");
            return;
        }
        if (premiumProductDetails == null) {
            queryPremiumProduct();
            sendPurchaseMessage("상품 정보를 불러오는 중입니다. 잠시 후 다시 눌러주세요.");
            return;
        }

        BillingFlowParams.ProductDetailsParams.Builder productParamsBuilder =
                BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(premiumProductDetails);

        List<ProductDetails.OneTimePurchaseOfferDetails> offers = premiumProductDetails.getOneTimePurchaseOfferDetailsList();
        if (offers != null && !offers.isEmpty()) {
            String offerToken = offers.get(0).getOfferToken();
            if (offerToken != null && !offerToken.isEmpty()) {
                productParamsBuilder.setOfferToken(offerToken);
            }
        }

        BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productParamsBuilder.build()))
                .build();

        BillingResult result = billingClient.launchBillingFlow(this, flowParams);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            sendPurchaseMessage("결제 화면을 열지 못했습니다: " + result.getDebugMessage());
        }
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) processPurchase(purchase);
            return;
        }
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            sendPurchaseMessage("결제가 취소되었습니다.");
        } else {
            sendPurchaseMessage("결제를 완료하지 못했습니다: " + billingResult.getDebugMessage());
        }
    }

    private void queryOwnedPurchases(boolean userRequestedRestore) {
        if (billingClient == null || !billingClient.isReady()) {
            reconnectBillingIfNeeded();
            if (userRequestedRestore) sendPurchaseMessage("Google Play 결제 서비스에 연결 중입니다.");
            return;
        }

        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                if (userRequestedRestore) sendPurchaseMessage("구매 내역을 확인하지 못했습니다.");
                return;
            }

            boolean owned = false;
            for (Purchase purchase : purchases) {
                if (purchase.getProducts().contains(PREMIUM_PRODUCT_ID)
                        && purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    owned = true;
                    processPurchase(purchase);
                }
            }

            // Google Play 조회가 정상 성공했을 때만 미소유 상태를 확정합니다.
            if (!owned) setPremium(false);
            if (userRequestedRestore) {
                sendPurchaseMessage(owned ? "프리미엄 구매 내역을 복원했습니다." : "복원할 프리미엄 구매 내역이 없습니다.");
            }
        });
    }

    private void processPurchase(Purchase purchase) {
        if (!purchase.getProducts().contains(PREMIUM_PRODUCT_ID)) return;

        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            sendPurchaseMessage("결제가 보류 중입니다. 결제가 완료되면 프리미엄이 활성화됩니다.");
            return;
        }
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;

        setPremium(true);

        if (!purchase.isAcknowledged()) {
            AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.getPurchaseToken())
                    .build();
            billingClient.acknowledgePurchase(params, result -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    sendPurchaseMessage("구매 확인 처리에 실패했습니다. 앱을 다시 실행해 주세요.");
                }
            });
        }
    }

    private void setPremium(boolean value) {
        premium = value;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_PREMIUM, value).apply();
        runOnUiThread(() -> {
            updateAdsVisibility();
            notifyPremiumState();
        });
    }

    private void notifyPremiumState() {
        if (webView == null) return;
        String js = "window.KanjiNative && window.KanjiNative.onPremiumStateChanged(" +
                (premium ? "true" : "false") + "," + JSONObject.quote(premiumPrice) + ");";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void sendPurchaseMessage(String message) {
        if (webView == null) return;
        String js = "window.KanjiNative && window.KanjiNative.onPurchaseMessage(" + JSONObject.quote(message) + ");";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void requestAdConsent() {
        consentInformation = UserMessagingPlatform.getConsentInformation(this);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();

        consentInformation.requestConsentInfoUpdate(
                this,
                params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(this, formError -> {
                    if (consentInformation.canRequestAds()) initializeAds();
                }),
                requestConsentError -> {
                    if (consentInformation.canRequestAds()) initializeAds();
                }
        );

        if (consentInformation.canRequestAds()) initializeAds();
    }

    private void initializeAds() {
        if (adsInitialized) return;
        adsInitialized = true;
        MobileAds.initialize(this, initializationStatus -> {
            updateAdsVisibility();
            preloadInterstitial();
        });
    }

    private void updateAdsVisibility() {
        if (premium || !adsInitialized) {
            adContainer.setVisibility(View.GONE);
            if (bannerAd != null) {
                bannerAd.destroy();
                bannerAd = null;
                adContainer.removeAllViews();
            }
            return;
        }

        if (bannerAd == null) {
            bannerAd = new AdView(this);
            bannerAd.setAdUnitId(getString(R.string.admob_banner_id));
            bannerAd.setAdSize(AdSize.BANNER);
            adContainer.removeAllViews();
            adContainer.addView(bannerAd);
            bannerAd.loadAd(new AdRequest.Builder().build());
        }
        adContainer.setVisibility(View.VISIBLE);
    }

    private void preloadInterstitial() {
        if (premium || !adsInitialized || interstitialAd != null) return;
        InterstitialAd.load(
                this,
                getString(R.string.admob_interstitial_id),
                new AdRequest.Builder().build(),
                new InterstitialAdLoadCallback() {
                    @Override
                    public void onAdLoaded(InterstitialAd ad) {
                        interstitialAd = ad;
                        interstitialAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                interstitialAd = null;
                                preloadInterstitial();
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(com.google.android.gms.ads.AdError adError) {
                                interstitialAd = null;
                                preloadInterstitial();
                            }
                        });
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError loadAdError) {
                        interstitialAd = null;
                    }
                }
        );
    }

    private void showInterstitialIfAvailable() {
        if (premium || !adsInitialized) return;
        if (interstitialAd != null) {
            interstitialAd.show(this);
        } else {
            preloadInterstitial();
        }
    }

    private void showPrivacyOptions() {
        if (consentInformation == null) return;
        UserMessagingPlatform.showPrivacyOptionsForm(this, formError -> {
            if (formError != null) {
                Toast.makeText(this, "개인정보 설정을 열지 못했습니다.", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (billingClient != null && billingClient.isReady()) {
            queryOwnedPurchases(false);
        } else {
            reconnectBillingIfNeeded();
        }
    }

    @Override
    protected void onDestroy() {
        if (bannerAd != null) bannerAd.destroy();
        if (billingClient != null) billingClient.endConnection();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public final class StoreBridge {
        @JavascriptInterface
        public boolean isPremium() {
            return premium;
        }

        @JavascriptInterface
        public String getProductPrice() {
            return premiumPrice;
        }

        @JavascriptInterface
        public void purchasePremium() {
            runOnUiThread(() -> launchPremiumPurchase());
        }

        @JavascriptInterface
        public void restorePurchases() {
            runOnUiThread(() -> queryOwnedPurchases(true));
        }

        @JavascriptInterface
        public void showInterstitial() {
            runOnUiThread(() -> showInterstitialIfAvailable());
        }

        @JavascriptInterface
        public void showPrivacyOptions() {
            runOnUiThread(() -> showPrivacyOptions());
        }
    }
}
