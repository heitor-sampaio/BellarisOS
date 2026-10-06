package com.archlabs.bellarisos;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * A sessão mora nos cookies do WebView (httpOnly, 7 dias) — o JS não a lê
     * nem a espelha nas Preferences desde 2026-10-06. O Android grava os
     * cookies em disco de tempos em tempos; ao sair do primeiro plano, grava
     * na hora, senão a sessão renovada pouco antes de o sistema matar o app se
     * perderia e a pessoa cairia no login.
     */
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
