//@target aftereffects
(function CultTranslator_Main(thisObj){
    // ====== CLIENT CONFIG (website build: license embedded at download time) ======
    // The server will replace "LICENSE" with a real key for each customer.
    var LICENSE_KEY = "LICENSE";
    // Cult dashboard / Crowdin Connector host — same SQLite `licenses` row as Crowdin + TMS (not ae-translate-proxy).
    var DASHBOARD_ORIGIN = "https://login.cultextensions.com";
    var PROXY_URL = DASHBOARD_ORIGIN.replace(/\/+$/, "") + "/api/translator/translate";
    var SERVER_BASE = DASHBOARD_ORIGIN.replace(/\/+$/, "");
    // ==================================

    // ---- constants ----
    var IS_WIN = ($.os && $.os.indexOf("Windows") === 0);
    // ✅ Updated: hardcode default Windows curl path
    var CURL   = IS_WIN ? "C:\\Windows\\System32\\curl.exe" : "/usr/bin/curl";
    var MODEL  = "gpt-4o-mini"; // you can change to "gpt-4o" if desired

    // Toggle to quickly see license/curl info once; leave false for production
    var DEBUG_SHOW_ONCE = false;
    // Prefer logging to server (Render logs) for support
    var DEBUG_TO_FILE = false;
    var DEBUG_TO_SERVER = true;

    // --- Master language list used by BOTH dropdowns (exactly 100) ---
    // (Now includes English (US) and English (UK))
    var LANGS_RAW =
"English|English (US)|English (UK)|Spanish|Spanish (Mexico)|Spanish (Spain)|Portuguese (Brazil)|Portuguese (Portugal)|French|German|Italian|Dutch|Russian|Ukrainian|Polish|Czech|Slovak|Hungarian|Romanian|Bulgarian|Greek|Turkish|Hebrew|Arabic (Standard)|Arabic (Egypt)|Arabic (Levant)|Persian (Farsi)|Dari|Pashto|Kurdish (Kurmanji)|Kurdish (Sorani)|Armenian|Georgian|Azerbaijani|Kazakh|Uzbek|Tajik|Mongolian|Chinese (Simplified)|Chinese (Traditional)|Cantonese|Japanese|Korean|Thai|Vietnamese|Indonesian|Malay|Filipino (Tagalog)|Lao|Khmer|Burmese|Sinhala|Nepali|Hindi|Urdu|Bengali|Punjabi (Gurmukhi)|Marathi|Gujarati|Tamil|Telugu|Kannada|Malayalam|Odia|Swahili|Amharic|Somali|Oromo|Yoruba|Igbo|Hausa|Wolof|Kinyarwanda|Shona|Zulu|Xhosa|Afrikaans|Malagasy|Quechua|Aymara|Guarani|Nahuatl (Central)|K’iche’|Haitian Creole|Jamaican Patois|Papiamento|Galician|Catalan|Basque|Swedish|Danish|Norwegian (Bokmål)|Finnish|Estonian|Latvian|Lithuanian|Icelandic|Slovenian|Croatian|Serbian|Macedonian|Albanian";

    function makeLangList(raw){
        var arr = raw.split("|");
        var clean = [];
        var seen = {};
        var i, s;
        for (i=0;i<arr.length;i++){
            s = arr[i];
            while (s.length && (s.charAt(0)===" " || s.charAt(0)==="\t" || s.charAt(0)==="\n" || s.charAt(0)==="\r")) s = s.substring(1);
            while (s.length && (s.charAt(s.length-1)===" " || s.charAt(s.length-1)==="\t" || s.charAt(s.length-1)==="\n" || s.charAt(s.length-1)==="\r")) s = s.substring(0, s.length-1);
            if (s && !seen[s]) { clean[clean.length]=s; seen[s]=1; }
        }
        clean.sort(); // ASCII sort, legacy-safe
        return clean;
    }
    var SRC_LANGS = makeLangList(LANGS_RAW);
    var TGT_LANGS = makeLangList(LANGS_RAW);

    // ---- tiny utils (legacy-safe) ----
    function trim(s){ return (s||"").replace(/^[\s\r\n\t]+|[\s\r\n\t]+$/g,""); }
    /** Strip chars that break curl -H "Name: value" quoting or confuse proxies. */
    function sanitizeHttpHeaderToken(s){
        return trim(s||"").replace(/[\r\n"]/g, "");
    }
    function sanitize(s){ if(!s) return ""; return s.replace(/[\u0000-\u001F\u007F-\u009F]/g,""); }
    function jsonEscape(s) {
        if (s===null || s===undefined) return "";
        s = ""+s;
        s = s.replace(/\\/g, "\\\\");
        s = s.replace(/"/g, "\\\"");
        s = s.replace(/\r/g, "\\r");
        s = s.replace(/\n/g, "\\n");
        s = s.replace(/\t/g, "\\t");
        return s;
    }
    function writeTextFile(f, txt){
        try{ f.encoding="UTF-8"; f.lineFeed="Unix"; if(!f.open("w")) return false; f.write(txt); f.close(); return true; }catch(e){ try{f.close();}catch(_){}
        return false; }
    }
    function appendTextFile(f, txt){
        try{ f.encoding="UTF-8"; f.lineFeed="Unix"; if(!f.open("a")) return false; f.write(txt); f.close(); return true; }catch(e){ try{f.close();}catch(_){}
        return false; }
    }
    function readTextFile(f){
        try{ f.encoding="UTF-8"; if(!f.open("r")) return ""; var t=f.read(); f.close(); return t; }catch(e){ try{f.close();}catch(_){}
        return ""; }
    }
    function run(cmd){ try{ return system.callSystem(cmd) || ""; }catch(e){ return ""; } }
    function alertIf(s){ try{ alert(s); }catch(e){} }

    function parseHttpCodeLoose(s){
        var t = trim(s||"");
        var m = t.match(/(\d{3})/);
        return m && m[1] ? m[1] : t;
    }

    function debugLog(msg){
        var line = "[" + (new Date()).toUTCString() + "] " + String(msg || "");
        if (DEBUG_TO_FILE) {
            try {
                var f = new File(Folder.temp.fsName + "/cult_translator_debug.log");
                appendTextFile(f, line + "\n");
            } catch(_) {}
        }
        if (DEBUG_TO_SERVER) {
            try {
                var origin = seatCheckDashboardOrigin().replace(/\/+$/,"");
                var url = origin + "/api/translator/panel-log";
                var licHdr = sanitizeHttpHeaderToken(embeddedLicenseKey() || ensureLicense());
                var emHdr = sanitizeHttpHeaderToken(readTranslatorDashboardEmail());
                var payload = '{"tag":"ae","level":"info","msg":"' + jsonEscape(line).slice(0, 760) + '"}';
                var TMP = Folder.temp;
                var TS = "" + (new Date().getTime());
                var REQ = new File(TMP.fsName + "/ct_pl_" + TS + ".json");
                if (!writeTextFile(REQ, payload)) return;
                var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS ' +
                          '--connect-timeout 4 --max-time 6 ' +
                          '-X POST ' +
                          (licHdr ? ('-H "x-license-key: ' + licHdr + '" ') : '') +
                          (emHdr ? ('-H "x-dashboard-email: ' + emHdr + '" ') : '') +
                          '-H "Content-Type: application/json" ' +
                          '--data-binary @"' + REQ.fsName + '" ' +
                          '-o NUL "' + url + '"';
                if (!IS_WIN) cmd = cmd.replace(/-o NUL /, '-o /dev/null ');
                run(cmd);
                try{ REQ.remove(); }catch(_) {}
            } catch(_) {}
        }
    }

    function openUrl(url) {
        if (!url) return;
        try {
            if (IS_WIN) {
                run('cmd /c start "" "' + url + '"');
            } else {
                run('/usr/bin/open "' + url + '"');
            }
        } catch (e) {
            alertIf("Please open this URL in your browser:\n\n" + url);
        }
    }

    // --- universalized matchNames for text access ---
    var TEXT_PROPS_MATCHNAME = "ADBE Text Properties";
    var TEXT_DOC_MATCHNAME   = "ADBE Text Document";

    function getSourceTextProp(layer) {
        if (!layer || layer.matchName !== "ADBE Text Layer") return null;
        var textProps = layer.property(TEXT_PROPS_MATCHNAME);
        if (!textProps) return null;
        return textProps.property(TEXT_DOC_MATCHNAME) || null;
    }

    // --- get a simple, stable device id (cross-platform) ---
    function getDeviceId(){
        var name;
        if (IS_WIN) {
            name = trim(run('hostname'));
        } else {
            name = trim(run('/usr/sbin/scutil --get ComputerName'));
            if (!name) name = trim(run('/bin/hostname'));
        }
        if (!name) name = "unknown-device";
        return name.replace(/[\r\n\t"'\`]/g, ' ');
    }

    // --- LICENSE: website build uses embedded LICENSE_KEY + optional license.json ---
    var CACHED_LICENSE = null;

    function readLicenseJson() {
        try {
            var here = File($.fileName);
            var folder = here.parent;
            if (!folder || !folder.exists) return null;

            var licFile = new File(folder.fsName + "/license.json");
            if (!licFile.exists) return null;

            licFile.encoding = "UTF-8";
            if (!licFile.open("r")) return null;
            var txt = licFile.read();
            licFile.close();

            txt = trim(txt || "");
            if (!txt) return null;

            // Very small regex-based JSON parse: "license": "KEY"
            var m = txt.match(/"license"\s*:\s*"([^"]+)"/);
            if (m && m[1]) {
                var key = trim(m[1]);
                if (key) return key;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function readTranslatorDashboardLicense(){
        var o = readTranslatorPrefsObject();
        if (o.dashboard_license_key != null && trim(String(o.dashboard_license_key)) !== "") {
            return trim(String(o.dashboard_license_key));
        }
        return "";
    }

    /** Workspace license saved in prefs only (not license.json / embedded). Sign-in onboarding stays visible until this is set. */
    function readTranslatorPrefsLicenseKeyOnly(){
        var o = readTranslatorPrefsObject();
        if (o.dashboard_license_key != null && trim(String(o.dashboard_license_key)) !== "") {
            return trim(String(o.dashboard_license_key));
        }
        return "";
    }

    function isTranslatorDashboardPrefsLinked(){
        var em = readTranslatorDashboardEmail();
        var lic = readTranslatorPrefsLicenseKeyOnly();
        return !!(em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) && lic);
    }

    function ensureLicense(){
        if (CACHED_LICENSE === null) {
            var fromPrefs = readTranslatorDashboardLicense();
            if (fromPrefs) {
                CACHED_LICENSE = fromPrefs;
            } else {
                var fromJson = readLicenseJson();
                if (fromJson) {
                    CACHED_LICENSE = fromJson;
                } else {
                    var embedded = trim(LICENSE_KEY || "");
                    CACHED_LICENSE = (embedded && embedded !== "LICENSE") ? embedded : "";
                }
            }
        }

        var k = CACHED_LICENSE || "";
        if (!k) {
            alertIf(
                "Missing license key.\n\n" +
                "Use Sign in on this panel and complete login in your browser so this panel can receive your workspace license automatically.\n\n" +
                "Alternatively you can add license.json next to this script:\n\n" +
                '{ "license": "YOUR-LICENSE-KEY" }'
            );
            return "";
        }
        return k;
    }

    function embeddedLicenseKey(){
        var embedded = trim(LICENSE_KEY || "");
        return (embedded && embedded !== "LICENSE") ? embedded : "";
    }

    function encodeURIComponentSafe(str){
        try {
            if (typeof encodeURIComponent !== "undefined") return encodeURIComponent(str);
        } catch(e1){}
        var s = ""+(str||"");
        var out = "";
        var i, c, hex;
        for (i = 0; i < s.length; i++){
            c = s.charAt(i);
            if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "-" || c === "_" || c === "." || c === "~"){
                out += c;
            } else if (c === " "){
                out += "+";
            } else {
                hex = (""+s.charCodeAt(i).toString(16)).toUpperCase();
                while (hex.length < 2) hex = "0" + hex;
                out += "%" + hex;
            }
        }
        return out;
    }

    function seatCheckDashboardOrigin(){
        var o = trim(DASHBOARD_ORIGIN || "");
        if (o) return o.replace(/\/+$/,"");
        /* Never use SERVER_BASE (translate proxy) for seat API — it returns 404. */
        return "https://login.cultextensions.com";
    }

    function makeAeNonceHex(){
        var hex = "0123456789abcdef";
        var out = "";
        var i;
        for (i = 0; i < 32; i++) {
            out += hex.charAt(Math.floor(Math.random() * 16));
        }
        return out;
    }

    function translatorAeSignInOpenUrl(nonce){
        var base = seatCheckDashboardOrigin().replace(/\/+$/,"");
        var nextPath = "/translator/ae-link?nonce=" + nonce;
        return base + "/login?next=" + encodeURIComponentSafe(nextPath);
    }

    function translatorDashboardLoginUrl(nextPath){
        var base = seatCheckDashboardOrigin().replace(/\/+$/,"");
        return base + "/login?next=" + encodeURIComponentSafe(nextPath || "/dashboard/translator/users");
    }

    // --- prefs persistence ---
    // Avoid writing extra files: store everything in After Effects app.settings.
    var PREFS_SECTION = "CultTranslatorDashboard";

    function settingsAvailable(){
        try { return !!(app && app.settings && typeof app.settings.getSetting === "function" && typeof app.settings.saveSetting === "function"); }
        catch(_) { return false; }
    }
    function getSetting(key, fallback){
        try {
            if (settingsAvailable() && app.settings.haveSetting(PREFS_SECTION, key)) {
                return app.settings.getSetting(PREFS_SECTION, key);
            }
        } catch(_) {}
        return fallback;
    }
    function setSetting(key, value){
        try {
            if (!settingsAvailable()) return false;
            app.settings.saveSetting(PREFS_SECTION, key, String(value));
            return true;
        } catch(_) { return false; }
    }
    function clearSetting(key){
        try {
            if (!settingsAvailable()) return false;
            if (app.settings.haveSetting(PREFS_SECTION, key)) app.settings.deleteSetting(PREFS_SECTION, key);
            return true;
        } catch(_) { return false; }
    }

    // Legacy read-only migration: if a JSON prefs file exists next to the script, we can import once.
    function legacyPrefsFile(){
        try {
            var here = File($.fileName);
            var folder = here.parent;
            if (!folder || !folder.exists) return null;
            var f = new File(folder.fsName + "/cult_translator_dashboard_prefs.json");
            return (f && f.exists) ? f : null;
        } catch(_) { return null; }
    }
    function readLegacyPrefsObject(){
        try {
            var f = legacyPrefsFile();
            if (!f) return {};
            var txt = trim(readTextFile(f) || "");
            if (txt.length && (txt.charCodeAt(0) === 65279 || txt.charAt(0) === "\uFEFF")) txt = trim(txt.substring(1));
            if (!txt) return {};
            if (typeof JSON !== "undefined" && typeof JSON.parse === "function") {
                var o = JSON.parse(txt);
                return (o && typeof o === "object") ? o : {};
            }
        } catch(_) {}
        return {};
    }

    function migrateLegacyPrefsOnce(){
        try {
            if (getSetting("migrated", "") === "1") return;
            var o = readLegacyPrefsObject();
            if (!o || typeof o !== "object") { setSetting("migrated", "1"); return; }
            if (o.dashboard_email) setSetting("dashboard_email", String(o.dashboard_email));
            if (o.dashboard_license_key) setSetting("dashboard_license_key", String(o.dashboard_license_key));
            if (typeof o.seat_ok_last !== "undefined") setSetting("seat_ok_last", String(o.seat_ok_last));
            if (typeof o.translator_onboarding_seen !== "undefined") setSetting("translator_onboarding_seen", String(o.translator_onboarding_seen));
            if (o.pending_nonce) setSetting("pending_nonce", String(o.pending_nonce));
            if (o.pending_nonce_at) setSetting("pending_nonce_at", String(o.pending_nonce_at));
            if (o.last_translate_ok_at) setSetting("last_translate_ok_at", String(o.last_translate_ok_at));
            setSetting("migrated", "1");
        } catch(_) {}
    }

    function readTranslatorPrefsObject(){
        migrateLegacyPrefsOnce();
        return {
            dashboard_email: getSetting("dashboard_email", ""),
            dashboard_license_key: getSetting("dashboard_license_key", ""),
            seat_ok_last: getSetting("seat_ok_last", ""),
            translator_onboarding_seen: getSetting("translator_onboarding_seen", ""),
            pending_nonce: getSetting("pending_nonce", ""),
            pending_nonce_at: getSetting("pending_nonce_at", ""),
            last_translate_ok_at: getSetting("last_translate_ok_at", "")
        };
    }

    function writeTranslatorPrefsBundle(emailLower, seatOkLast, onboardingSeen, licenseKeyOpt){
        var em = trim(emailLower || "").toLowerCase();
        var prevLic = readTranslatorDashboardLicense();
        var lk = licenseKeyOpt !== undefined && licenseKeyOpt !== null ? trim(licenseKeyOpt) : prevLic;
        var p = readTranslatorPrefsObject();
        var pendingNonce = p && p.pending_nonce ? trim(String(p.pending_nonce)) : "";
        var pendingNonceAt = p && p.pending_nonce_at ? Number(p.pending_nonce_at) : 0;
        var lastTranslateOkAt = p && p.last_translate_ok_at ? Number(p.last_translate_ok_at) : 0;
        CACHED_LICENSE = null;
        var ok = true;
        ok = setSetting("dashboard_email", em) && ok;
        ok = setSetting("dashboard_license_key", lk) && ok;
        if (seatOkLast === true) ok = setSetting("seat_ok_last", "true") && ok;
        else if (seatOkLast === false) ok = setSetting("seat_ok_last", "false") && ok;
        else ok = setSetting("seat_ok_last", "null") && ok;
        ok = setSetting("translator_onboarding_seen", onboardingSeen ? "true" : "false") && ok;
        if (pendingNonce) ok = setSetting("pending_nonce", pendingNonce) && ok; else clearSetting("pending_nonce");
        if (pendingNonceAt) ok = setSetting("pending_nonce_at", String(pendingNonceAt)) && ok; else clearSetting("pending_nonce_at");
        if (lastTranslateOkAt) ok = setSetting("last_translate_ok_at", String(lastTranslateOkAt)) && ok; else clearSetting("last_translate_ok_at");
        if (!ok) debugLog("prefs: failed to write app.settings");
        return ok;
    }

    function writeTranslatorLastTranslateOk(){
        try {
            var o = readTranslatorPrefsObject();
            var em = trim(o.dashboard_email || "").toLowerCase();
            var lk = trim(o.dashboard_license_key || "");
            var seatOkLast = readTranslatorSeatOkLast();
            var onboardingSeen = readTranslatorOnboardingSeen();
            var pendingNonce = o && o.pending_nonce ? trim(String(o.pending_nonce)) : "";
            var pendingNonceAt = o && o.pending_nonce_at ? Number(o.pending_nonce_at) : 0;
            var at = (new Date()).getTime();
            var ok = true;
            ok = setSetting("dashboard_email", em) && ok;
            ok = setSetting("dashboard_license_key", lk) && ok;
            if (seatOkLast === true) ok = setSetting("seat_ok_last", "true") && ok;
            else if (seatOkLast === false) ok = setSetting("seat_ok_last", "false") && ok;
            else ok = setSetting("seat_ok_last", "null") && ok;
            ok = setSetting("translator_onboarding_seen", onboardingSeen ? "true" : "false") && ok;
            if (pendingNonce) ok = setSetting("pending_nonce", pendingNonce) && ok; else clearSetting("pending_nonce");
            if (pendingNonceAt) ok = setSetting("pending_nonce_at", String(pendingNonceAt)) && ok; else clearSetting("pending_nonce_at");
            ok = setSetting("last_translate_ok_at", String(at)) && ok;
            if (!ok) debugLog("prefs: failed to write last_translate_ok_at (app.settings)");
            return ok;
        } catch (_) {
            return false;
        }
    }

    function writeTranslatorPendingNonce(nonce){
        var o = readTranslatorPrefsObject();
        var em = trim(o.dashboard_email || "").toLowerCase();
        var lk = trim(o.dashboard_license_key || "");
        var seatOkLast = readTranslatorSeatOkLast();
        var onboardingSeen = readTranslatorOnboardingSeen();
        var n = trim(nonce || "");
        var at = (new Date()).getTime();
        var ok = true;
        ok = setSetting("dashboard_email", em) && ok;
        ok = setSetting("dashboard_license_key", lk) && ok;
        if (seatOkLast === true) ok = setSetting("seat_ok_last", "true") && ok;
        else if (seatOkLast === false) ok = setSetting("seat_ok_last", "false") && ok;
        else ok = setSetting("seat_ok_last", "null") && ok;
        ok = setSetting("translator_onboarding_seen", onboardingSeen ? "true" : "false") && ok;
        if (n) ok = setSetting("pending_nonce", n) && ok; else clearSetting("pending_nonce");
        ok = setSetting("pending_nonce_at", String(at)) && ok;
        if (!ok) debugLog("prefs: failed to write pending nonce (app.settings)");
        return ok;
    }

    function readTranslatorPendingNonce(){
        var o = readTranslatorPrefsObject();
        var n = o && o.pending_nonce != null ? trim(String(o.pending_nonce)) : "";
        var at = o && o.pending_nonce_at != null ? Number(o.pending_nonce_at) : 0;
        return { nonce: n, at: isNaN(at) ? 0 : at };
    }

    function readTranslatorDashboardEmail(){
        var o = readTranslatorPrefsObject();
        if (o.dashboard_email != null && trim(String(o.dashboard_email)) !== "") {
            return trim(String(o.dashboard_email)).toLowerCase();
        }
        return "";
    }

    function readTranslatorSeatOkLast(){
        var o = readTranslatorPrefsObject();
        if (o && typeof o.seat_ok_last !== "undefined") {
            if (o.seat_ok_last === null || o.seat_ok_last === "null") return null;
            if (o.seat_ok_last === true || o.seat_ok_last === "true") return true;
            if (o.seat_ok_last === false || o.seat_ok_last === "false") return false;
        }
        return null;
    }

    function readTranslatorOnboardingSeen(){
        var o = readTranslatorPrefsObject();
        if (o.translator_onboarding_seen === true || o.translator_onboarding_seen === "true") return true;
        return false;
    }

    function getAeLinkStatusOnce(nonce){
        var origin = seatCheckDashboardOrigin().replace(/\/+$/, "");
        if (!origin || !nonce) return null;
        var url = origin + "/api/translator/ae-link-status?nonce=" + encodeURIComponentSafe(nonce);
        var TMP = Folder.temp;
        var TS = "" + new Date().getTime();
        var RES = new File(TMP.fsName + "/ct_ae_st_" + TS + ".json");
        var cmd =
            CURL +
            ' -4 --http1.1 --noproxy "*" -sS ' +
            '--connect-timeout 10 --max-time 20 ' +
            '-o "' +
            RES.fsName +
            '" ' +
            '"' +
            url +
            '" ' +
            '-w "HTTP_CODE:%{http_code}"';
        var out = run(cmd);
        var http = parseHttpCodeLoose(out);
        var body = readTextFile(RES);
        try {
            RES.remove();
        } catch (s1) {}
        // On Windows curl may write warnings into the same file; trust the body if it looks like JSON.
        if ((!body || body.length === 0) && http !== "200") return null;
        if (body && body.indexOf("{") === -1) {
            if (http !== "200") return null;
        }
        var linked = body.indexOf('"linked":true') !== -1 || body.indexOf('"linked": true') !== -1;
        if (!linked) return { linked: false };
        var emailOut = "";
        var emM = body.match(/"email"\s*:\s*"([^"]+)"/);
        if (emM && emM[1]) emailOut = trim(emM[1]).toLowerCase();
        var seatOk =
            body.indexOf('"seat_ok":true') !== -1 || body.indexOf('"seat_ok": true') !== -1;
        var licM = body.match(/"license_key"\s*:\s*"([^"]*)"/);
        var licOut = licM && licM[1] ? trim(licM[1]) : "";
        return { linked: true, email: emailOut, seat_ok: seatOk, license_key: licOut };
    }

    /** Prefer server license_key; else prefs / license.json / embedded key so linking completes after OAuth. */
    function resolveLicenseKeyForLinkedSession(st){
        var emb = embeddedLicenseKey();
        if (emb) return emb;
        var lk = trim(st.license_key || "");
        if (lk) return lk;
        lk = trim(readTranslatorDashboardLicense());
        if (lk) return lk;
        try {
            var lj = readLicenseJson();
            if (lj) return trim(lj);
        } catch (ljErr) {}
        if (emb) return emb;
        return "";
    }

    function runTranslatorSignInAndPoll(){
        var nonce = makeAeNonceHex();
        // Persist nonce so the panel can resume polling on next open (if AE reloads or user switches tabs).
        try { writeTranslatorPendingNonce(nonce); } catch(eP) {}
        openUrl(translatorAeSignInOpenUrl(nonce));
        var max = 55;
        var i;
        for (i = 0; i < max; i++) {
            $.sleep(850);
            var st = getAeLinkStatusOnce(nonce);
            if (st && st.linked === true && st.email) {
                var lk = resolveLicenseKeyForLinkedSession(st);
                /* seat_ok from ae-link can be false when seat is only on Crowdin allowlist; sync allowed-seat next. */
                writeTranslatorPrefsBundle(st.email, null, true, lk ? lk : undefined);
                return { ok: true, email: st.email, seat_ok: st.seat_ok };
            }
        }
        return { ok: false };
    }

    function postTranslatorAllowedSeat(licenseKey, emailLower){
        var origin = seatCheckDashboardOrigin();
        if (!origin || !licenseKey || !emailLower) return { ok: false, skipped: true, http: "", body: "" };
        var url = origin.replace(/\/+$/,"") + "/api/translator/allowed-seat";
        var payload = '{"email":"' + jsonEscape(emailLower) + '"}';
        var TMP = Folder.temp;
        var TS = "" + (new Date().getTime());
        var REQ = new File(TMP.fsName + "/ct_seat_" + TS + ".json");
        var RES = new File(TMP.fsName + "/ct_seat_res_" + TS + ".json");
        if (!writeTextFile(REQ, payload)) return { ok: false, skipped: false, http: "", body: "" };
        var licHdr = sanitizeHttpHeaderToken(licenseKey);
        var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS ' +
                  '--connect-timeout 10 --max-time 20 ' +
                  '-X POST -H "x-license-key: ' + licHdr + '" ' +
                  '-H "Content-Type: application/json" ' +
                  '--data-binary @"' + REQ.fsName + '" ' +
                  '-o "' + RES.fsName + '" ' +
                  '"' + url + '" ' +
                  '-w "HTTP_CODE:%{http_code}"';
        var out = run(cmd);
        var http = parseHttpCodeLoose(out);
        var body = readTextFile(RES);
        try{ REQ.remove(); }catch(e4){}
        try{ RES.remove(); }catch(e5){}
        var ok = (http === "200") && body && (body.indexOf('"ok":true') !== -1 || body.indexOf('"ok": true') !== -1);
        var outLic = "";
        if (ok && body) {
            var lm = body.match(/"license_key"\s*:\s*"([^"]*)"/);
            if (lm && lm[1]) outLic = trim(lm[1]);
        }
        return { ok: ok, skipped: false, http: http, body: body, license_key: outLic };
    }

    function ensureTranslatorSeatOrExplain(licenseKey){
        var seatOrigin = seatCheckDashboardOrigin();
        if (!seatOrigin) return true;
        var em = readTranslatorDashboardEmail();
        if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
            alertIf(
                "Link your Cult account first: use Sign in at the top of this panel (or in Settings) and finish in the browser."
            );
            return false;
        }
        var r = postTranslatorAllowedSeat(licenseKey, em);
        try { debugLog("seat: http=" + (r.http||"(none)") + " ok=" + (r.ok ? "true" : "false") + " body=" + trim(String(r.body||"")).slice(0,200)); } catch(_) {}
        if (r.skipped) return true;
        if (r.ok) {
            var resolvedLic = trim(licenseKey);
            if (r.license_key) resolvedLic = trim(r.license_key);
            else if (r.body) {
                var lm2 = r.body.match(/"license_key"\s*:\s*"([^"]*)"/);
                if (lm2 && lm2[1]) resolvedLic = trim(lm2[1]);
            }
            writeTranslatorPrefsBundle(em, true, readTranslatorOnboardingSeen(), resolvedLic);
            return true;
        }
        var loginUrl = translatorDashboardLoginUrl("/dashboard/translator/workspace");
        var bod = (r && r.body) ? trim(String(r.body)) : "";
        var shortMsg = "You aren’t allowed to translate on this license yet.\n\nAsk your Cult Studio admin to add your email under Workspaces (seats), then tap Refresh on this panel.";
        if (bod.indexOf("email_not_listed") !== -1) {
            shortMsg = "Your signed-in email isn’t on this license’s seat list.\n\nAsk your Cult Studio admin to add you under Workspaces, then tap Refresh here.";
        } else if (bod.indexOf("license_mismatch") !== -1 || bod.toLowerCase().indexOf("license mismatch") !== -1) {
            shortMsg = "The license in this panel doesn’t match your Cult Studio workspace (for example you’re on more than one team, or the panel needs relinking).\n\nOpen Cult Studio in your browser and check Workspaces, then tap Refresh here—or sign out and sign in again.";
        } else if (r && r.http && trim(r.http) && trim(r.http) !== "200") {
            shortMsg = "Could not verify access (HTTP " + trim(r.http) + ").\n\nTap Refresh or sign in again.";
        }
        alertIf(shortMsg);
        try { openUrl(loginUrl); } catch(e7) {}
        return false;
    }

    function getActiveComp(){
        var c = app.project && app.project.activeItem;
        if(!c || !(c instanceof CompItem)){ alertIf("Open/select a composition first."); return null; }
        return c;
    }

    // --- recursively collect text layers from a CompItem (avoid cycles via visited map)
    function collectTextLayersFromComp(comp, out, visited) {
        if (!comp || !(comp instanceof CompItem)) return;
        if (!visited) visited = {};
        var key = comp.id ? ("" + comp.id) : ("name:" + comp.name);
        if (visited[key]) return;
        visited[key] = 1;

        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (L.matchName === "ADBE Text Layer") out[out.length] = L;
            if (L.source && (L.source instanceof CompItem)) collectTextLayersFromComp(L.source, out, visited);
        }
    }

    // --- include text inside selected precomps (recursively). Fallback: active comp only.
    function getTargetTextLayers(comp){
        var out = [];
        var i;
        var sel = (comp && comp.selectedLayers) ? comp.selectedLayers : [];
        if (sel && sel.length > 0) {
            var visited = {};
            for (i = 0; i < sel.length; i++) {
                var L = sel[i];
                if (L.matchName === "ADBE Text Layer") out[out.length] = L;
                if (L.source && (L.source instanceof CompItem)) collectTextLayersFromComp(L.source, out, visited);
            }
            return out;
        }
        for (i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.matchName === "ADBE Text Layer") out[out.length] = layer;
        }
        return out;
    }

    // Pull assistant "content" string and correctly unescape sequences (fixes stray 'n')
    function extractContentFromBody(body){
        if (!body) return "";
        var key = '"content"';
        var i = body.indexOf(key);
        if (i < 0) return "";
        var colon = body.indexOf(":", i);
        if (colon < 0) return "";
        var q1 = body.indexOf('"', colon+1);
        if (q1 < 0) return "";

        var out = [];
        var p = q1 + 1;
        while (p < body.length) {
            var ch = body.charAt(p);

            // stop at the first unescaped quote
            if (ch === '"') {
                // count backslashes before it to see if it's escaped
                var bs = 0, q = p - 1;
                while (q >= 0 && body.charAt(q) === "\\") { bs++; q--; }
                if ((bs % 2) === 0) break; // not escaped → end of string
            }

            if (ch === "\\") {
                var nxt = (p + 1 < body.length) ? body.charAt(p + 1) : "";
                if (nxt === "n") { out[out.length] = "\n"; p += 2; continue; }
                if (nxt === "r") { out[out.length] = "\r"; p += 2; continue; }
                if (nxt === "t") { out[out.length] = "\t"; p += 2; continue; }
                if (nxt === '"' ) { out[out.length] = '"';  p += 2; continue; }
                if (nxt === "\\") { out[out.length] = "\\"; p += 2; continue; }
                // unknown escape → drop backslash, keep next char if present
                if (nxt) { out[out.length] = nxt; p += 2; continue; }
                p++; continue; // trailing backslash
            }

            out[out.length] = ch;
            p++;
        }

        var s = out.join("");
        // normalize line endings
        s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        return s;
    }

    // === TRIAL UPGRADE DIALOG (unchanged) ===
    function showTrialUpgradeDialog(reasonText){
        var dlg = new Window("dialog", "Cult Translator — Upgrade");
        dlg.orientation = "column";
        dlg.alignChildren = ["fill","top"];
        dlg.margins = 16;
        dlg.spacing = 10;

        var topBar = dlg.add("group");
        topBar.orientation = "row";
        topBar.alignChildren = ["right","top"];
        topBar.alignment = ["fill","top"];
        topBar.margins = 0;

        var filler = topBar.add("statictext", undefined, "");
        filler.alignment = ["fill","top"];

        var btnCloseX = topBar.add("button", undefined, "✕");
        btnCloseX.preferredSize = [20, 20];
        btnCloseX.alignment = ["right","top"];
        btnCloseX.onClick = function(){ dlg.close(); };

        var msg = dlg.add("statictext", undefined, "You’ve reached the limits of the free trial.", {multiline:true});
        msg.maximumSize.width = 380;

        var msg2 = dlg.add("statictext", undefined,
            reasonText || "To keep using Cult Translator in your daily workflow, choose a plan below.",
            {multiline:true}
        );
        msg2.maximumSize.width = 380;

        var groupPlans = dlg.add("group");
        groupPlans.orientation = "column";
        groupPlans.alignChildren = ["fill","top"];
        groupPlans.spacing = 10;

        // Yearly plan block
        var yearlyPanel = groupPlans.add("panel", undefined, "");
        yearlyPanel.orientation = "column";
        yearlyPanel.alignChildren = ["fill","top"];
        yearlyPanel.margins = 8;
        yearlyPanel.spacing = 4;

        var yearlyHeader = yearlyPanel.add("group");
        yearlyHeader.orientation = "row";
        yearlyHeader.alignChildren = ["left","center"];
        var yearlyLabel = yearlyHeader.add("statictext", undefined, "Yearly");
        try {
            yearlyLabel.graphics.font = ScriptUI.newFont(
                yearlyLabel.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                yearlyLabel.graphics.font.size
            );
        } catch(e){}
        yearlyHeader.add("statictext", undefined, " — Save 35% · US$59/yr");

        yearlyPanel.add("statictext", undefined, "- Our most popular plan.");
        yearlyPanel.add("statictext", undefined, "- Full access to all features.");
        yearlyPanel.add("statictext", undefined, "- Ideal for studios, agencies and teams.");

        // Monthly plan block
        var monthlyPanel = groupPlans.add("panel", undefined, "");
        monthlyPanel.orientation = "column";
        monthlyPanel.alignChildren = ["fill","top"];
        monthlyPanel.margins = 8;
        monthlyPanel.spacing = 4;

        var monthlyHeader = monthlyPanel.add("group");
        monthlyHeader.orientation = "row";
        monthlyHeader.alignChildren = ["left","center"];
        var monthlyLabel = monthlyHeader.add("statictext", undefined, "Monthly");
        try {
            monthlyLabel.graphics.font = ScriptUI.newFont(
                monthlyLabel.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                monthlyLabel.graphics.font.size
            );
        } catch(e){}
        monthlyHeader.add("statictext", undefined, " — US$7.90/mo");

        monthlyPanel.add("statictext", undefined, "- Full access to all features.");
        monthlyPanel.add("statictext", undefined, "- Flexible option for freelancers and small teams.");

        // Buttons
        var buttons = dlg.add("group");
        buttons.orientation = "row";
        buttons.alignChildren = ["center","center"];
        buttons.alignment = ["center","top"];
        buttons.spacing = 10;

        var btnYearly  = buttons.add("button", undefined, "Get Yearly");
        var btnMonthly = buttons.add("button", undefined, "Get Monthly");

        btnYearly.preferredSize  = [130, 28];
        btnMonthly.preferredSize = [130, 28];

        try {
            var g2 = btnYearly.graphics;
            var bluePen2 = g2.newPen(g2.PenType.SOLID_COLOR, [0.2, 0.6, 1.0, 1], 1);
            g2.foregroundColor = bluePen2;
        } catch(e){}

        var URL_YEARLY  = "https://buy.cultextensions.com/b/3cI28sds1d1B5VW3jg2VG04?utm_source=yearly";
        var URL_MONTHLY = "https://buy.cultextensions.com/b/fZuaEYew53r12JKaLI2VG03?utm_source=monthly";

        btnYearly.onClick = function(){
            openUrl(URL_YEARLY);
            dlg.close();
        };
        btnMonthly.onClick = function(){
            openUrl(URL_MONTHLY);
            dlg.close();
        };

        dlg.center();
        dlg.show();
    }

    // Final production version: no debug files, no leftover logs.
    // layerCount = total number of text layers being translated in this run
    function callOpenAI(payloadJSON, licenseKey, docsBase, layerCount){
        var TMP = Folder.temp;
        var TS  = "" + (new Date().getTime());
        var base = (docsBase||"AE_GPT_UI") + "_" + TS + "_";

        var REQ  = new File(TMP.fsName + "/" + base + "req.json");
        var RES  = new File(TMP.fsName + "/" + base + "res.json");
        var HTTP = new File(TMP.fsName + "/" + base + "http.txt");

        // Write payload to temp file
        if (!writeTextFile(REQ, payloadJSON)) {
            alertIf("Failed to write temp file for payload.");
            return { http:"", body:"", reqPath:"", resPath:"", httpPath:"" };
        }

        var DEVICE_ID = sanitizeHttpHeaderToken(getDeviceId());
        var licHdr = sanitizeHttpHeaderToken(licenseKey);
        var dashEmailHdr = sanitizeHttpHeaderToken(readTranslatorDashboardEmail());
        var LAYERS = (typeof layerCount === "number" && layerCount > 0) ? layerCount : 0;

        // Curl command — no inline echo, fully quote-safe
        var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS ' +
                  '--connect-timeout 10 --max-time 60 ' +
                  '--retry 2 --retry-delay 1 --retry-connrefused ' +
                  '-X POST ' +
                  '-H "x-license-key: ' + licHdr + '" ' +
                  '-H "x-device-id: ' + DEVICE_ID + '" ' +
                  '-H "x-device-name: ' + DEVICE_ID + '" ' +
                  '-H "x-layer-count: ' + LAYERS + '" ' +
                  (dashEmailHdr ? ('-H "x-dashboard-email: ' + dashEmailHdr + '" ') : '') +
                  '-H "Content-Type: application/json" ' +
                  '--data-binary @"' + REQ.fsName + '" ' +
                  '-o "' + RES.fsName + '" ' +
                  '"' + PROXY_URL + '" ' +
                  '-w "HTTP_CODE:%{http_code}"';

        debugLog("translate: start; curl=" + CURL + "; url=" + PROXY_URL + "; email=" + (dashEmailHdr||"(none)") + "; layers=" + LAYERS);
        var out = run(cmd);

        var http = parseHttpCodeLoose(out);
        var body = readTextFile(RES);
        debugLog("translate: http=" + http + " out=" + trim(String(out||"")).slice(0,120));
        debugLog("translate: body=" + trim(String(body||"")).slice(0,260));

        // Clean up immediately (no files left)
        try{ REQ.remove(); }catch(e){}
        try{ RES.remove(); }catch(e){}
        try{ HTTP.remove(); }catch(e){}

        return { http:http, body:body, reqPath:"", resPath:"", httpPath:"" };
    }

    // === FIXED: buildPayloadForChunk now explicitly instructs <<<#k>>> ... <<<END>>> blocks ===
    function buildPayloadForChunk(items, srcLang, tgtLang, context){
        var sys = "You are a precise translator and localizer. Translate from " + srcLang + " to " + tgtLang + ". " +
                  "Culturalize references naturally for the target locale (currency, idioms, places, sports, foods). " +
                  "Keep the same capitalization style.";

        var instr =
            "You will receive " + items.length + " text item(s), each marked as [#k].\n" +
            "For EACH item k, you MUST output ONLY ONE block using this exact format:\n\n" +
            "<<<#k>>>\n" +
            "TRANSLATION OF ITEM k\n" +
            "<<<END>>>\n\n" +
            "Rules:\n" +
            "- One block per item, in order from 1 to " + items.length + ".\n" +
            "- Do NOT add any text before the first block or after the last block.\n" +
            "- Do NOT add explanations or numbering outside the <<<#k>>> markers.\n";

        if (context && context.length) {
            instr += "\nAdditional context you MUST respect:\n" + context + "\n";
        }

        instr += "\nItems:\n";

        var k;
        for (k=0;k<items.length;k++){
            instr += "[#" + (k+1) + "] " + items[k] + "\n";
        }

        var payload =
            '{' +
              '"model":"' + MODEL + '",' +
              '"messages":[' +
                '{"role":"system","content":"' + jsonEscape(sys)  + '"},' +
                '{"role":"user","content":"'   + jsonEscape(instr) + '"}' +
              '],' +
              '"temperature":0.2' +
            '}';

        return payload;
    }

    // Parse assistantText into array of blocks using <<<#k>>> ... <<<END>>> (tolerant to variants)
    function parseDelimitedBlocks(assistantText, expectedCount){
        var s = assistantText || "";
        s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        s = s.replace(/<<<\s*end\s*>>>/gi, "<<<END>>>")
             .replace(/<<<\s*#\s*(\d+)\s*>>>/gi, "<<<#$1>>>");

        var results = [];
        var pos = 0;
        var found = 0;

        while (found < expectedCount) {
            var startIdx = s.indexOf("<<<#", pos);
            if (startIdx < 0) break;

            var closeStart = s.indexOf(">>>", startIdx);
            if (closeStart < 0) break;

            var numStr = s.substring(startIdx + 4, closeStart);
            var k = parseInt(trim(numStr), 10);
            if (isNaN(k) || k < 1) { pos = closeStart + 3; continue; }

            var contentStart = closeStart + 3;
            if (s.charAt(contentStart) === '\n') contentStart++;

            var endIdx = s.indexOf("<<<END>>>", contentStart);
            if (endIdx < 0) endIdx = s.indexOf("<<<END>>", contentStart);
            if (endIdx < 0) {
                var nextBlock = s.indexOf("<<<#", contentStart);
                endIdx = (nextBlock > -1) ? nextBlock : s.length;
            }

            var block = s.substring(contentStart, endIdx);
            block = trim(block.replace(/^\uFEFF/, ""));

            results[k-1] = block;

            pos = endIdx + "<<<END>>>".length;
            found++;
        }

        var i2;
        for (i2=0; i2<expectedCount; i2++){
            if (results[i2] === undefined) results[i2] = "";
        }
        return results;
    }

    // ---- build UI panel ----
    function buildUI(thisObj){
        var pal = (thisObj instanceof Panel) ? thisObj : new Window("palette", "Cult Translator", undefined, {resizeable:true});
        pal.orientation = "column";
        pal.alignChildren = ["fill","top"];
        pal.margins = 10;
        pal.spacing = 8;
        pal.preferredSize = [580, 420];

        var MAIN_TAB_PREF_W = 560;
        var MAIN_TAB_PREF_H = 320;
        var MAIN_TAB_MIN_W = 320;
        var MAIN_TAB_MIN_H = 200;

        var contentStack = pal.add("group");
        contentStack.orientation = "stack";
        contentStack.alignChildren = ["fill", "fill"];
        try {
            contentStack.alignment = ["fill", "top"];
            contentStack.preferredSize = [MAIN_TAB_PREF_W, MAIN_TAB_PREF_H];
        } catch (cs0) {}

        var grpMain = contentStack.add("group");
        grpMain.orientation = "column";
        grpMain.alignChildren = ["fill", "top"];
        try {
            grpMain.alignment = ["fill", "top"];
        } catch (gmA) {}

        var tabs = grpMain.add("tabbedpanel");
        tabs.alignChildren = ["fill","top"];
        try {
            tabs.preferredSize = [MAIN_TAB_PREF_W, MAIN_TAB_PREF_H];
            tabs.minimumSize = [MAIN_TAB_MIN_W, MAIN_TAB_MIN_H];
        } catch (tb) {}

        var tabTranslate = tabs.add("tab", undefined, "Translate");
        tabTranslate.orientation = "column";
        tabTranslate.alignChildren = ["fill","top"];
        tabTranslate.margins = 10;
        tabTranslate.spacing = 8;
        var translateStatus = tabTranslate.add("statictext", undefined, "", {multiline:true});
        try { translateStatus.maximumSize.width = 540; } catch(_) {}
        function setTranslateStatus(s){ try { translateStatus.text = s || ""; } catch(_) {} }

        var rowLang = tabTranslate.add("group");
        rowLang.orientation = "row";
        rowLang.alignChildren = ["fill", "top"];
        rowLang.spacing = 10;

        var colSrc = rowLang.add("group"); colSrc.orientation="column"; colSrc.alignChildren=["fill","top"];
        colSrc.add("statictext", undefined, "Source language:");
        var ddSrc = colSrc.add("dropdownlist", undefined, SRC_LANGS);
        var i; ddSrc.selection = 0;
        for (i=0;i<SRC_LANGS.length;i++){
            if (SRC_LANGS[i] === "English (US)") { ddSrc.selection = i; break; }
        }

        var colTgt = rowLang.add("group"); colTgt.orientation="column"; colTgt.alignChildren=["fill","top"];
        colTgt.add("statictext", undefined, "Target language:");
        var ddTgt = colTgt.add("dropdownlist", undefined, TGT_LANGS);
        ddTgt.selection = 0;
        for (i=0; i < TGT_LANGS.length; i++){
            if (TGT_LANGS[i] === "Spanish (Spain)") { ddTgt.selection = i; break; }
        }

        var rowCtx = tabTranslate.add("group");
        rowCtx.orientation = "row";
        rowCtx.alignChildren = ["fill","top"];
        rowCtx.spacing = 10;

        var CONTEXT_PLACEHOLDER = "Context (optional)";
        var edCtx = rowCtx.add("edittext", undefined, CONTEXT_PLACEHOLDER);
        edCtx.alignment = ["fill","top"];
        edCtx.preferredSize = [0, 24];
        try {
            edCtx.minimumSize = [120, 22];
            edCtx.maximumSize = [MAIN_TAB_PREF_W - 20, 28];
        } catch (edSz) {}

        edCtx.addEventListener("focus", function(){
            if (edCtx.text === CONTEXT_PLACEHOLDER) edCtx.text = "";
        });
        edCtx.addEventListener("blur", function(){
            if (!trim(edCtx.text)) edCtx.text = CONTEXT_PLACEHOLDER;
        });

        var btnRun = tabTranslate.add("button", undefined, "Translate");
        try {
            btnRun.preferredSize = [260, 36];
            btnRun.alignment = ["fill", "top"];
        } catch (brs) {}

        var grpOnboard = contentStack.add("group");
        grpOnboard.orientation = "column";
        grpOnboard.alignChildren = ["center", "center"];
        grpOnboard.spacing = 0;
        try {
            grpOnboard.preferredSize = [MAIN_TAB_PREF_W, 200];
        } catch (obG) {}
        var onboardPanel = grpOnboard.add("panel", undefined, "Get started");
        onboardPanel.orientation = "column";
        onboardPanel.alignChildren = ["center", "center"];
        try {
            onboardPanel.margins = [10, 16, 10, 12];
            onboardPanel.spacing = 10;
            onboardPanel.alignment = ["center", "center"];
        } catch (obP) {}
        var btnOnboardSignIn = onboardPanel.add("button", undefined, "Sign in to Cult Studio");
        try {
            btnOnboardSignIn.preferredSize = [220, 30];
            btnOnboardSignIn.helpTip = "Opens your browser to sign in with Google and link this workspace.";
        } catch (obB) {}
        var onboardStatus = onboardPanel.add("statictext", undefined, "", {multiline:true});
        try {
            onboardStatus.maximumSize.width = 520;
        } catch (osz) {}

        var tabSettings = tabs.add("tab", undefined, "Settings");
        tabSettings.orientation = "column";
        tabSettings.alignChildren = ["fill","top"];
        tabSettings.margins = 16;
        tabSettings.spacing = 14;

        var rowStudio = tabSettings.add("group");
        rowStudio.orientation = "row";
        rowStudio.alignChildren = ["fill", "top"];
        rowStudio.spacing = 8;
        rowStudio.margins = [0, 4, 0, 8];

        var grpStudioLeft = rowStudio.add("group");
        grpStudioLeft.orientation = "row";
        grpStudioLeft.alignChildren = ["left", "center"];
        grpStudioLeft.alignment = ["left", "center"];

        var grpStudioFill = rowStudio.add("group");
        grpStudioFill.orientation = "row";
        grpStudioFill.alignChildren = ["fill", "center"];
        grpStudioFill.alignment = ["fill", "center"];
        var studioRowSpacer = grpStudioFill.add("statictext", undefined, "");
        try {
            studioRowSpacer.alignment = ["fill", "center"];
        } catch (srSp) {}

        var grpStudioRight = rowStudio.add("group");
        grpStudioRight.orientation = "row";
        grpStudioRight.alignChildren = ["right", "center"];
        grpStudioRight.alignment = ["right", "center"];

        function styleBlueLinkStatic(st) {
            try {
                var g = st.graphics;
                var pen = g.newPen(g.PenType.SOLID_COLOR, [0.12, 0.42, 0.92, 1], 1);
                g.foregroundColor = pen;
            } catch (slS) {}
        }

        function bindStaticLinkClick(st, handler) {
            try {
                st.addEventListener("mousedown", function () {
                    handler();
                });
            } catch (lc1) {
                try {
                    st.addEventListener("click", function () {
                        handler();
                    });
                } catch (lc2) {}
            }
        }

        var linkOpenStudio = grpStudioLeft.add("statictext", undefined, "Open Cult Studio");
        linkOpenStudio.helpTip = "Opens Cult Studio in your browser for this workspace.";
        styleBlueLinkStatic(linkOpenStudio);
        bindStaticLinkClick(linkOpenStudio, function () {
            openUrl(seatCheckDashboardOrigin().replace(/\/+$/, "") + "/dashboard/translator/users");
        });

        var linkStudioRefresh = grpStudioRight.add("statictext", undefined, "Refresh");
        linkStudioRefresh.helpTip = "Refresh workspace license from Cult Studio";
        styleBlueLinkStatic(linkStudioRefresh);

        var rowAuth = tabSettings.add("group");
        rowAuth.orientation = "row";
        rowAuth.alignChildren = ["fill", "center"];
        rowAuth.spacing = 12;
        rowAuth.margins = [0, 0, 0, 10];

        var btnSignIn = rowAuth.add("button", undefined, "Sign in");
        try {
            btnSignIn.preferredSize = [140, 30];
            btnSignIn.alignment = ["fill", "center"];
        } catch (siPen) {}
        var btnSignOut = rowAuth.add("button", undefined, "Sign out");
        try {
            btnSignOut.preferredSize = [140, 34];
            btnSignOut.alignment = ["fill", "center"];
        } catch (soPen) {}

        var lblAcctHeading = tabSettings.add("statictext", undefined, "Account");
        try {
            lblAcctHeading.graphics.font = ScriptUI.newFont(lblAcctHeading.graphics.font.name, ScriptUI.FontStyle.BOLD, 13);
        } catch (acctBold) {}

        var panelConn = tabSettings.add("panel", undefined, "Connection");
        panelConn.orientation = "column";
        panelConn.alignChildren = ["fill","top"];
        panelConn.margins = 12;
        panelConn.spacing = 10;

        var lblDevice = panelConn.add("statictext", undefined, "", { multiline: true });
        try {
            lblDevice.maximumSize.width = 520;
            lblDevice.minimumSize = [220, 44];
        } catch (pdDev) {}

        var lblEmail = panelConn.add("statictext", undefined, "", { multiline: true });
        try {
            lblEmail.maximumSize.width = 520;
            lblEmail.minimumSize = [220, 44];
        } catch (pdEm) {}
        var lblAuthStatus = panelConn.add("statictext", undefined, "", { multiline: true });
        try {
            lblAuthStatus.maximumSize.width = 520;
            lblAuthStatus.minimumSize = [220, 22];
        } catch (pdSt) {}

        function updateOnboardingChrome(){
            var linked = isTranslatorDashboardPrefsLinked();
            try {
                grpMain.visible = linked;
                grpOnboard.visible = !linked;
            } catch (eOb) {}
        }

        function refreshSettingsLabels(){
            lblDevice.text = "Machine ID\n" + getDeviceId();
            var em = readTranslatorDashboardEmail();
            var linkedEm = isTranslatorDashboardPrefsLinked();
            lblEmail.text = linkedEm ? ("Signed in as\n" + em) : "Signed in as\n— not linked yet —";
            var seatOk = readTranslatorSeatOkLast();
            var lastOkAt = 0;
            try { lastOkAt = Number(readTranslatorPrefsObject().last_translate_ok_at || 0) || 0; } catch (_) { lastOkAt = 0; }
            var recentTranslateOk = false;
            if (lastOkAt && !isNaN(lastOkAt)) {
                try { recentTranslateOk = ((new Date()).getTime() - lastOkAt) < (7 * 24 * 60 * 60 * 1000); } catch (_) { recentTranslateOk = false; }
            }
            if (!linkedEm) {
                lblAuthStatus.text = "Status\nNot linked. Use Sign in to connect this panel.";
            } else if (seatOk === false && !recentTranslateOk) {
                lblAuthStatus.text = "Status\nLinked, but this email is not allowed on the current license. Use Refresh after your admin adds you.";
            } else if (seatOk === true) {
                lblAuthStatus.text = "Status\nConnected.";
            } else if (recentTranslateOk) {
                lblAuthStatus.text = "Status\nConnected.";
            } else {
                lblAuthStatus.text = "Status\nConnected (verifying…) — click Refresh if it doesn’t finish.";
            }
            updateOnboardingChrome();
        }

        function syncSeatFromServer(){
            var em = readTranslatorDashboardEmail();
            if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
                refreshSettingsLabels();
                return;
            }
            var lic = embeddedLicenseKey() || ensureLicense();
            if (!lic) {
                refreshSettingsLabels();
                return;
            }
            var r = postTranslatorAllowedSeat(trim(lic), em);
            if (r.skipped) {
                refreshSettingsLabels();
                return;
            }
            if (r.ok) {
                var resolved = trim(lic);
                if (r.license_key) resolved = trim(r.license_key);
                writeTranslatorPrefsBundle(em, true, readTranslatorOnboardingSeen(), resolved);
            } else {
                // Any 200 response with ok:false should flip the status away from "verifying forever".
                if (trim(r.http) === "200" || (r.body && (r.body.indexOf('"ok":false') !== -1 || r.body.indexOf('"ok": false') !== -1))) {
                    writeTranslatorPrefsBundle(em, false, readTranslatorOnboardingSeen(), readTranslatorDashboardLicense());
                }
            }
            refreshSettingsLabels();
        }

        function setOnboardStatus(msg){
            try { onboardStatus.text = msg || ""; } catch(_) {}
        }

        function runSignInFlow(goTranslateTab){
            setOnboardStatus("Waiting for browser sign-in…\nIf a login page is open, finish Google sign-in, then return to After Effects.");
            var r = runTranslatorSignInAndPoll();
            syncSeatFromServer();
            refreshSettingsLabels();
            if (goTranslateTab) {
                try {
                    tabs.selection = tabTranslate;
                } catch (tsT) {}
            }
            if (r.ok) {
                setOnboardStatus("Linked as " + r.email + ". You can close the browser tab.");
                alertIf("Linked as " + r.email + ".");
            } else {
                setOnboardStatus(
                    "No link received.\n\n" +
                    "1) Complete sign-in in your browser.\n" +
                    "2) Keep the Cult page open for a moment.\n" +
                    "3) Click Sign in again."
                );
                alertIf(
                    "No link received yet.\n\nComplete Google sign-in on the Cult site, wait on the confirmation page until it loads, then try Sign in again."
                );
            }
        }

        function clearTranslatorDashboardSession(){
            CACHED_LICENSE = null;
            writeTranslatorPrefsBundle("", false, readTranslatorOnboardingSeen(), "");
            refreshSettingsLabels();
        }

        bindStaticLinkClick(linkStudioRefresh, function () {
            syncSeatFromServer();
            refreshSettingsLabels();
        });

        btnSignOut.onClick = function () {
            clearTranslatorDashboardSession();
        };

        btnSignIn.onClick = function(){
            runSignInFlow(false);
        };

        btnOnboardSignIn.onClick = function () {
            runSignInFlow(true);
        };

        try {
            tabs.onChange = function () {
                try {
                    if (tabs.selection === tabSettings) {
                        syncSeatFromServer();
                        refreshSettingsLabels();
                    }
                } catch (tcInner) {}
            };
        } catch (tcOuter) {}

        refreshSettingsLabels();
        try {
            // Best-effort: if user already linked before, verify seat once per open (no infinite loops).
            if (isTranslatorDashboardPrefsLinked()) {
                syncSeatFromServer();
                refreshSettingsLabels();
            }
        } catch (_) {}

        /* Cult Connector: resize only on panel drag — avoids some AE ScriptUI layout(true) resets. */
        pal.onResizing = pal.onResize = function () {
            try {
                this.layout.resize();
            } catch (rz2) {}
        };

        btnRun.onClick = function(){
            setTranslateStatus("");
            debugLog("ui: Translate clicked");
            var license = embeddedLicenseKey() || ensureLicense();
            if (!license) return;
            license = trim(license);
            if (!isTranslatorDashboardPrefsLinked()) {
                alertIf("Link your Cult account first: open the Settings tab and use Sign in, then finish in the browser.");
                return;
            }
            if (!ensureTranslatorSeatOrExplain(license)) return;
            /* Seat API may return canonical workspace license_key; prefs updated — must not translate with stale key. */
            license = trim(ensureLicense() || "");
            if (!license) {
                alertIf(
                    "Seat check finished but no license key is saved.\n\nOpen Settings and tap the blue Refresh link, then try Translate again."
                );
                return;
            }
            refreshSettingsLabels();

            if (DEBUG_SHOW_ONCE) {
                alertIf("Using license: [" + license + "]");
                alertIf(run(CURL + " -V"));
                DEBUG_SHOW_ONCE = false;
            }

            // Curl presence check (cross-platform)
            var cv = run(CURL + " -V");
            if (!cv || cv.toLowerCase().indexOf("curl") === -1) {
                var hint = IS_WIN
                    ? "I couldn't find curl on Windows. Ensure curl.exe is available (normally in C:\\Windows\\System32) or add it to PATH.\n"
                    : "I couldn't run /usr/bin/curl on macOS.\n";
                alertIf(hint + "Also ensure 'Allow Scripts to Write Files and Access Network' is enabled in Preferences.");
                return;
            }

            var comp = getActiveComp(); if (!comp) { setTranslateStatus("No active composition selected."); debugLog("ui: no active comp"); return; }

            var layers = getTargetTextLayers(comp);
            if (layers.length === 0) { alertIf("No text layers found."); setTranslateStatus("No text layers found."); debugLog("ui: no text layers"); return; }

            var srcLang = ddSrc.selection ? ddSrc.selection.text : "English (US)";
            var tgtLang = ddTgt.selection ? ddTgt.selection.text : "Spanish (Spain)";
            var ctxRaw  = edCtx.text || "";
            var ctx     = (ctxRaw === CONTEXT_PLACEHOLDER) ? "" : trim(ctxRaw);

            var texts = [];
            var ptrs  = [];
            var i2;

            for (i2=0;i2<layers.length;i2++){
                var L = layers[i2];
                var sp = getSourceTextProp(L);
                if (!sp) continue;
                var doc = sp.value;
                var src = doc.text || "";

                if (src.length >= 4 && src.charAt(0)==='/' && src.charAt(1)==='*') {
                    var endC = src.indexOf("*/");
                    if (endC >= 0) src = src.substring(endC+2);
                }
                src = sanitize(src);
                if (!src) continue;

                texts[texts.length] = src;
                ptrs[ptrs.length]   = {layer:L, sp:sp, doc:doc};
            }

            if (texts.length === 0) { alertIf("All selected text layers are empty."); setTranslateStatus("All selected text layers are empty."); debugLog("ui: empty text layers"); return; }

            var totalLayerCount = texts.length;

            var MAX_ITEMS_PER_CALL = 8; // stability
            var updatedTotal = 0;

            app.beginUndoGroup("Translate ("+srcLang+" → "+tgtLang+")");

            var pos = 0;
            while (pos < texts.length) {
                var endIdx = Math.min(pos + MAX_ITEMS_PER_CALL, texts.length);

                var chunkItems = [];
                var chunkPtrs  = [];
                var c;
                for (c=pos; c<endIdx; c++){
                    chunkItems[chunkItems.length] = texts[c];
                    chunkPtrs[chunkPtrs.length]   = ptrs[c];
                }

                var payload = buildPayloadForChunk(chunkItems, srcLang, tgtLang, ctx);
                setTranslateStatus("Translating…");
                var resp = callOpenAI(payload, license, "AE_GPT_UI_BATCH", totalLayerCount);

                // Detect trial-specific errors (expired or layer cap) and show upgrade dialog
                var isTrialLimit = false;
                var isTrialExpired = false;
                if (resp && resp.http === "403") {
                    var lowerBody = (resp.body || "").toLowerCase();
                    if (lowerBody.indexOf("trial_limit_exceeded") !== -1) {
                        isTrialLimit = true;
                    } else if (lowerBody.indexOf("trial expired") !== -1) {
                        isTrialExpired = true;
                    }
                }

                if (isTrialLimit || isTrialExpired) {
                    app.endUndoGroup();
                    var reason;
                    if (isTrialLimit) {
                        reason = "The free trial is limited to 100 text layers in total.\n\n" +
                                 "To keep using Cult Translator for larger projects and ongoing work, choose a plan below.";
                    } else {
                        reason = "To continue enjoying Cult Translator in your daily workflow, choose a plan below.";
                    }
                    showTrialUpgradeDialog(reason);
                    return;
                }

                var hasAssistantContent = resp && resp.body && resp.body.indexOf('"content"') !== -1;
                if (resp.http !== "200" && !hasAssistantContent) {
                    var errMsg = "Proxy error on batch " + (pos+1) + "-" + endIdx +
                            ": HTTP " + (resp.http||"(none)");
                    if (resp.http === "403") {
                        var lb403 = (resp.body || "").toLowerCase();
                        if (lb403.indexOf("seat_required") !== -1 || lb403.indexOf("not on this workspace") !== -1 || lb403.indexOf("allowlist") !== -1) {
                            alertIf("Not allowed for this workspace.\n\nOpen Cult Studio → Users to add your email, then click Refresh.");
                            break;
                        }
                        if (lb403.indexOf("trial") === -1) {
                            errMsg +=
                                "\n\nIf this mentions an invalid license, open Settings and tap Refresh (top right), then translate again.";
                        }
                    }
                    errMsg += resp.body ? ("\n\nBody:\n" + resp.body) : "";
                    alertIf(errMsg);
                    setTranslateStatus("Failed (HTTP " + (resp.http||"(none)") + ").");
                    break;
                }

                var assistantText = extractContentFromBody(resp.body);
                if (!assistantText) assistantText = resp.body;

                var blocks = parseDelimitedBlocks(assistantText, chunkItems.length);

                for (var j=0;j<chunkPtrs.length;j++){
                    var translated = trim(blocks[j] || "");
                    translated = translated.replace(/^\n+/, "").replace(/\n+$/, "");
                    translated = translated.replace(/\\n/g, "\n");
                    translated = trim(translated);

                    if (translated.length){
                        var p2 = chunkPtrs[j];
                        p2.doc.text = translated;
                        p2.sp.setValue(p2.doc);
                        updatedTotal++;
                    }
                }

                // If we successfully got a 200 from the proxy, consider the seat verified (helps avoid stale “not allowed” status on some Windows installs).
                if (resp && resp.http === "200") {
                    try { writeTranslatorLastTranslateOk(); } catch(_) {}
                    try {
                        var emOk = readTranslatorDashboardEmail();
                        if (emOk) writeTranslatorPrefsBundle(emOk, true, readTranslatorOnboardingSeen(), embeddedLicenseKey() || ensureLicense());
                    } catch(_) {}
                }

            pos = endIdx;
            }

            app.endUndoGroup();
            alertIf("Done. Updated " + updatedTotal + " text layer(s) via batched call(s).");
            setTranslateStatus("Done. Updated " + updatedTotal + " layer(s).");
            syncSeatFromServer();
            refreshSettingsLabels();
        };

        pal.layout.layout(true);

        if (pal instanceof Window) { pal.center(); pal.show(); }
        return pal;
    }

    buildUI(thisObj);
})(this);
