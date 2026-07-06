//@target aftereffects
(function CultConnectorAE_Plugin(thisObj){

  /* Must match PUBLIC_BASE_URL in server .env.
   * Phrase OAuth requires HTTPS: run `cloudflared tunnel --url http://127.0.0.1:8787` and paste the https://….trycloudflare.com URL here and in .env. */
  var SERVER_BASE = "https://login.cultextensions.com";
  // TMS: "" until chosen | "crowdin_team" | "crowdin_enterprise" | "phrase"
  var TMS_PROVIDER = "";
  var TMS_PREFS_FILE = Folder.userData.fsName + "/CultConnector/tms-provider.txt";
  /** Optional: Cult Studio workspace license key (from dashboard) when your email is in multiple workspaces. */

  var EP_OAUTH_START = "";
  var EP_OAUTH_START_TEAM = "";
  var EP_OAUTH_START_ENTERPRISE = "";
  var EP_OAUTH_STATUS = "";
  var EP_PROJECTS = "";
  var EP_PROJECT_OPEN_URL = "";
  var EP_PROJECT_BROWSER_LINK = "";
  var EP_SELECT_PROJECT = "";
  var EP_LANGS = "";
  var EP_STRINGS = "";
  var EP_SCAN_FRAME = "";
  /** Phrase TMS: finalize deferred job after screenshots ({@link finalize} ae/publish). */
  var EP_PUBLISH = "";
  var EP_PULL = "";
  var EP_AUTO_TRANSLATE = "";
  var EP_PSEUDO_TRANSLATE = "";
  var EP_DISCONNECT = "";
  var EP_PHRASE_OAUTH_CONNECTED = "";

  function tmsIntegrationPrefix() {
    if (TMS_PROVIDER === "phrase") return "phrase";
    return "crowdin";
  }

  function refreshEndpoints() {
    var p = tmsIntegrationPrefix();
    var base = SERVER_BASE + "/integrations/" + p;
    EP_OAUTH_START = base + "/oauth/start.json";
    EP_OAUTH_START_TEAM = EP_OAUTH_START + "?mode=team";
    EP_OAUTH_START_ENTERPRISE = EP_OAUTH_START + "?mode=enterprise";
    EP_OAUTH_STATUS = base + "/oauth/status";
    EP_PROJECTS = base + "/projects";
    EP_PROJECT_OPEN_URL = base + "/project/open-url";
    EP_PROJECT_BROWSER_LINK = base + "/project/browser-link";
    EP_SELECT_PROJECT = base + "/select-project";
    EP_LANGS = base + "/project/languages";
    EP_STRINGS = base + "/ae/strings";
    EP_SCAN_FRAME = base + "/ae/scan-frame";
    EP_PUBLISH = base + "/ae/publish";
    EP_PULL = base + "/ae/pull";
    EP_AUTO_TRANSLATE = base + "/ae/auto-translate";
    EP_PSEUDO_TRANSLATE = SERVER_BASE + "/integrations/crowdin/ae/pseudo-translate";
    EP_DISCONNECT = base + "/disconnect";
    EP_PHRASE_OAUTH_CONNECTED = SERVER_BASE + "/integrations/phrase/oauth/connected";
  }

  function tmsDisplayName() {
    if (TMS_PROVIDER === "phrase") return "Phrase TMS";
    if (TMS_PROVIDER === "crowdin_enterprise") return "Crowdin Enterprise";
    if (TMS_PROVIDER === "crowdin_team") return "Crowdin";
    return "TMS";
  }

  /** Short brand for UI labels (export/import popups, settings panel). */
  function tmsBrandName() {
    if (TMS_PROVIDER === "phrase") return "Phrase";
    if (TMS_PROVIDER === "crowdin_enterprise" || TMS_PROVIDER === "crowdin_team") return "Crowdin";
    return "TMS";
  }

  /** AE resolution divisor for timeline PNG export (2 = Half, 4 = Quarter). Phrase uses lower res for speed. */
  function scanForceResolutionDivisor() {
    return (TMS_PROVIDER === "phrase") ? 4 : 2;
  }

  function scanPngQualityForTms() {
    return (TMS_PROVIDER === "phrase") ? "min" : SCAN_PNG_QUALITY;
  }

  function loadTmsProviderFromDisk() {
    try {
      var f = new File(TMS_PREFS_FILE);
      if (!f.exists) return "";
      f.open("r");
      var v = (f.read() || "").replace(/^\s+|\s+$/g, "");
      f.close();
      if (v === "phrase" || v === "crowdin_team" || v === "crowdin_enterprise") return v;
    } catch (e) {}
    return "";
  }

  function saveTmsProviderToDisk(provider) {
    try {
      var dir = new Folder(Folder.userData.fsName + "/CultConnector");
      if (!dir.exists) dir.create();
      var f = new File(TMS_PREFS_FILE);
      f.open("w");
      f.write(provider || "");
      f.close();
    } catch (e2) {}
  }

  var cbSegmentation = null;
  var cbLangAll = null;

  function setTmsProvider(provider) {
    TMS_PROVIDER = provider || "";
    saveTmsProviderToDisk(TMS_PROVIDER);
    refreshEndpoints();
  }

  TMS_PROVIDER = loadTmsProviderFromDisk();
  refreshEndpoints();

  var IS_WIN = ($.os && $.os.indexOf("Windows") === 0);
  // 32-bit AE runs 32-bit cmd; WoW64 redirects System32 -> SysWOW64, so curl.exe (in real System32) is not found. Use SysNative from 32-bit to get real System32.
  var CURL;
  if (IS_WIN) {
    var _curlExeProbe = new File("C:\\Windows\\SysNative\\curl.exe");
    CURL = _curlExeProbe.exists ? "C:\\Windows\\SysNative\\curl.exe" : "C:\\Windows\\System32\\curl.exe";
  } else {
    CURL = "/usr/bin/curl";
  }
  // On Windows, cmd.exe expands %VAR% and -w "%{http_code}" breaks; use -D (dump headers) and parse status instead.
  var CURL_HTTP_CODE = IS_WIN ? "" : "%{http_code}";
  /** License header for API calls; server auto-picks a valid seat for the signed-in email. */
  function getLicenseHeaderForRequest() {
    return "PENDING";
  }

  // Plugin version (used for update checks via GitHub Releases).
  var PLUGIN_VERSION = "1.4.8";
  var UPDATE_GITHUB_OWNER = "CultExtensions";
  // Publish releases on GitHub with a .jsxbin (or .jsx) asset attached to each tag (e.g. v1.1.1).
  var UPDATE_GITHUB_REPO  = "cultstudio";
  // Preferred release asset name; if not found we fall back to the first .jsxbin, then .jsx.
  var UPDATE_ASSET_NAME_PREFERRED = "Cult.Connector.AE.TMS.jsxbin";
  // Installed panel filenames (must match Mac/Win installer and postinstall).
  var UPDATE_PANEL_INSTALL_JSXBIN = "Cult Connector (AE \u2194 TMS).jsxbin";
  var UPDATE_PANEL_INSTALL_JSX = "Cult Connector (AE \u2194 TMS).jsx";
  var UPDATE_PANEL_ALT_JSXBIN = "Cult.Connector.AE.TMS.jsxbin";

  // ✅ knobs
  var MIN_OPACITY = 10;           // 10% minimum (allow export); prefer 100%
  var PREFERRED_OPACITY = 100;    // prefer frame when opacity is 100%
  var MIN_SCALE = 0.5;            // minimum scale (50%) when scale animates; prefer 100%
  var MIN_IN_RATIO = 0.35;        // strict: 35% bbox inside
  var STABLE_FRAMES = 3;          // typewriter stability frames
  var CAPTURE_DELAY_FRAMES = 2;   // capture a few frames later
  var FALLBACK_RATIO = 0.05;      // fallback: 5% bbox inside
  // Screenshot resolution for Crowdin (1 = full comp size; 2 = half; 4 = quarter). Set EXPORT_SCALE_UP to render larger than comp (e.g. 2 = double dimensions).
  var SCREENSHOT_RES_FACTOR = (typeof SCREENSHOT_RES_FACTOR_OVERRIDE !== "undefined" && SCREENSHOT_RES_FACTOR_OVERRIDE > 0) ? SCREENSHOT_RES_FACTOR_OVERRIDE : 1;
  // Timeline-scan resolution: matches SCREENSHOT_RES_FACTOR by default.
  var SCAN_RES_FACTOR = (typeof SCAN_RES_FACTOR_OVERRIDE !== "undefined" && SCAN_RES_FACTOR_OVERRIDE > 0) ? SCAN_RES_FACTOR_OVERRIDE : SCREENSHOT_RES_FACTOR;
  // Scan export resolution for Crowdin: 1 = Full, 0.5 = Half, 0.25 = Quarter. Half = smaller uploads. Override: SCAN_EXPORT_RESOLUTION_OVERRIDE.
  var SCAN_EXPORT_RESOLUTION = (typeof SCAN_EXPORT_RESOLUTION_OVERRIDE !== "undefined" && SCAN_EXPORT_RESOLUTION_OVERRIDE > 0 && SCAN_EXPORT_RESOLUTION_OVERRIDE <= 1) ? SCAN_EXPORT_RESOLUTION_OVERRIDE : 0.5;
  // Export at 3x comp dimensions for Crowdin context (larger + sharper). 1 = comp size; 2 = double; 3 = triple. Override: EXPORT_SCALE_UP_OVERRIDE.
  var EXPORT_SCALE_UP = (typeof EXPORT_SCALE_UP_OVERRIDE !== "undefined" && EXPORT_SCALE_UP_OVERRIDE >= 1) ? EXPORT_SCALE_UP_OVERRIDE : 3;

  // ✅ NEW rescue bbox size (used only if geometry fails)
  var RESCUE_BBOX_W = 280;
  var RESCUE_BBOX_H = 100;
  // Shrink sourceRect-based bbox so highlight better matches visible text (AE often returns slightly large bounds). 1 = no change, 0.96 = 2% inset each side.
  var BBOX_TIGHTEN_RATIO = (typeof BBOX_TIGHTEN_RATIO_OVERRIDE !== "undefined" && BBOX_TIGHTEN_RATIO_OVERRIDE >= 0.5 && BBOX_TIGHTEN_RATIO_OVERRIDE <= 1) ? BBOX_TIGHTEN_RATIO_OVERRIDE : 0.96;
  // Crowdin API expects tag positions in 480×270. Server scales from our export dimensions to 480×270.
  var CROWDIN_TAG_W = 480;
  var CROWDIN_TAG_H = 270;
  // Max export size: resolution factor scales comp to fit inside this (no comp resize). Override: SCAN_EXPORT_RESOLUTION_OVERRIDE (0-1).
  var CROWDIN_EXPORT_MAX_W = 1920;
  var CROWDIN_EXPORT_MAX_H = 1080;
  // Half quality: resolution/downsample factor applied on top of fit scale (0.5 = half res; 1 = full). Override: CROWDIN_EXPORT_DOWNSAMPLE_OVERRIDE (0.25–1).
  var CROWDIN_EXPORT_DOWNSAMPLE_FACTOR = (typeof CROWDIN_EXPORT_DOWNSAMPLE_OVERRIDE !== "undefined" && CROWDIN_EXPORT_DOWNSAMPLE_OVERRIDE >= 0.25 && CROWDIN_EXPORT_DOWNSAMPLE_OVERRIDE <= 1) ? CROWDIN_EXPORT_DOWNSAMPLE_OVERRIDE : 0.5;
  // Crowdin displays screenshots larger in the context view when the filename ends with @2x or @3x (e.g. name@2x.png). 1 = normal name (no suffix).
  var CROWDIN_DISPLAY_SCALE = (typeof CROWDIN_DISPLAY_SCALE_OVERRIDE !== "undefined" && CROWDIN_DISPLAY_SCALE_OVERRIDE >= 1 && CROWDIN_DISPLAY_SCALE_OVERRIDE <= 3) ? Math.floor(CROWDIN_DISPLAY_SCALE_OVERRIDE) : 1;
  // PNG quality for scan export on Mac only: "high"=90-100, "normal"=75-92, "low"=50-75, "min"=35-55 (smallest). Requires pngquant. Windows: server compresses. Override: SCAN_PNG_QUALITY_OVERRIDE.
  var SCAN_PNG_QUALITY = (typeof SCAN_PNG_QUALITY_OVERRIDE !== "undefined") ? SCAN_PNG_QUALITY_OVERRIDE : "min";
  /** Crowdin WYSIWYG: full frame only — no yellow per-string highlight overlay. */
  var SCAN_FRAME_NO_HIGHLIGHT = true;

  function makeScanFrameBox(c, bbExport) {
    var box = {
      id: c.id,
      stringIdentifier: c.id,
      aeCompId: (c.layerComp && c.layerComp.id != null) ? Number(c.layerComp.id) : null,
      aeLayerIndex: (c.layer && c.layer.index != null) ? Number(c.layer.index) : null,
      layerName: (c.layer && c.layer.name) ? String(c.layer.name).replace(/[\r\n]+/g, " ") : null,
      bbox: bbExport,
      source: c.best.source || null,
      text: c.layerText || null
    };
    if (SCAN_FRAME_NO_HIGHLIGHT) box.noHighlight = true;
    return box;
  }

  function scanFrameUploadFields(projectId, fileKey, tMs, ssName, ssW, ssH, cultStringId, frameIndex) {
    var fields = [
      { name: "projectId", value: projectId },
      { name: "fileKey", value: fileKey },
      { name: "t", value: tMs },
      { name: "ssName", value: ssName },
      { name: "ssWidth", value: ssW },
      { name: "ssHeight", value: ssH }
    ];
    if (cultStringId) fields.push({ name: "cultStringId", value: String(cultStringId) });
    if (frameIndex != null && frameIndex !== "") {
      fields.push({ name: "frameIndex", value: String(frameIndex) });
      fields.push({ name: "stringIndex", value: String(frameIndex) });
    }
    if (SCAN_FRAME_NO_HIGHLIGHT) fields.push({ name: "noHighlight", value: "1" });
    return fields;
  }

  // Track matte: set DEBUG_MATTE_LOG = true before running (e.g. in another script that #includes this) to write Crowdin_matte_debug.txt to Documents with per-frame ref bbox and ratio.
  // Typewriter: set DEBUG_TYPEWRITER_LOG = true before running to write Crowdin_typewriter_debug.txt with effect/animator discovery and result time.
  var DEBUG_TYPEWRITER_LOG = false;  // Log files disabled; set true only for debugging typewriter/smart scan.

  /** Marker comment used for Snapshot Marker (preferred screenshot time per layer). One marker per layer; Smart Scan uses this time when present. */
  function getSnapshotMarkerComment() {
    if (TMS_PROVIDER === "phrase") return "Phrase";
    return "Crowdin";
  }

  /** Recognize Snapshot Marker on read (Crowdin/Phrase; either provider label works). */
  function isSnapshotMarkerComment(cmt) {
    if (cmt == null) return false;
    cmt = String(cmt).replace(/^\s+|\s+$/g, "");
    return cmt === "Crowdin" || cmt === "Phrase" || cmt === getSnapshotMarkerComment();
  }

  var STATE = {
    connected: false,
    projectId: "",
    projectName: "",
    compId: "",
    fileKey: "",
    projects: [],
    /** Enterprise org slug from server (e.g. cultextensions) for browser links. */
    crowdinOrganization: "",
    languages: [],
    // Segmentation is on by default; user can uncheck to minimize segmentation.
    useSegmentation: true,
    // Compositions to send: array of comp ids (numbers). When non-empty, Send uses this list instead of panel selection.
    compsToSend: []
  };

  /** Per-layer cache for Blinking Cursor full-text bbox dimensions (w,h). Cleared at start of smartScanTimeline so we never modify effects and Ctrl+Z restores animation. */
  var __blinkFullTextSizeCache = {};

  var compCheckboxes = [];

  /** Scale bbox from export dimensions (ssW×ssH) to Crowdin tag space (480×270) so API accepts positions. */
  function scaleBboxToCrowdin(bb, ssW, ssH) {
    if (!bb || ssW <= 0 || ssH <= 0) return bb;
    var sx = CROWDIN_TAG_W / ssW, sy = CROWDIN_TAG_H / ssH;
    var x = Math.round(bb.x * sx), y = Math.round(bb.y * sy);
    var w = Math.max(1, Math.round(bb.w * sx)), h = Math.max(1, Math.round(bb.h * sy));
    x = Math.min(Math.max(0, x), CROWDIN_TAG_W - 1);
    y = Math.min(Math.max(0, y), CROWDIN_TAG_H - 1);
    w = Math.min(w, CROWDIN_TAG_W - x);
    h = Math.min(h, CROWDIN_TAG_H - y);
    return { x: x, y: y, w: Math.max(1, w), h: Math.max(1, h) };
  }

  /** Map comp-space bbox to export (PNG) pixel space. Offset compensates for AE half-res sampling so highlight centers on text (tune CROWDIN_BBOX_OFFSET_* if needed). */
  function compBboxToExportBbox(bb, scale) {
    if (!bb || scale <= 0) return bb;
    var ox = (typeof CROWDIN_BBOX_OFFSET_X === "number") ? CROWDIN_BBOX_OFFSET_X : -5;
    var oy = (typeof CROWDIN_BBOX_OFFSET_Y === "number") ? CROWDIN_BBOX_OFFSET_Y : -3;
    var x1 = Math.floor(bb.x * scale + ox);
    var y1 = Math.floor(bb.y * scale + oy);
    var x2 = Math.floor((bb.x + bb.w) * scale + ox);
    var y2 = Math.floor((bb.y + bb.h) * scale + oy);
    return {
      x: Math.max(0, x1),
      y: Math.max(0, y1),
      w: Math.max(1, x2 - x1),
      h: Math.max(1, y2 - y1)
    };
  }

  /**
   * Helper used by the panel to create buttons in one place.
   * NOTE: currently this just returns a standard ScriptUI button so we keep
   * the stock look and blue focus highlight.
   */
  function createFlatButton(parent, label, helpTip, minHeight) {
    var btn = parent.add("button", undefined, label || "");
    if (helpTip) btn.helpTip = helpTip;
    if (minHeight && minHeight > 0) {
      btn.minimumSize = [0, minHeight];
      btn.preferredSize = [-1, minHeight];
    }
    return btn;
  }

  /** Build screenshot name for Crowdin; @2x/@3x suffix makes context view display larger. */
  function crowdinScreenshotName(baseNameNoExt) {
    return baseNameNoExt + (CROWDIN_DISPLAY_SCALE >= 2 ? "@" + CROWDIN_DISPLAY_SCALE + "x" : "") + ".jpg";
  }

  /**
   * Safe base for screenshot filenames. Keeps ASCII letters, digits, dot, dash, underscore;
   * replaces other characters (including accents) with underscores so Windows paths and
   * Crowdin filenames are always safe.
   */
  function safeScreenshotBase(name) {
    var s = String(name || "");
    if (!s) return "comp";
    s = s.replace(/[^A-Za-z0-9_.-]+/g, "_");
    s = s.replace(/^_+/, "").replace(/_+$/, "");
    return s.length ? s : "comp";
  }

  function trim(s){ return (s||"").replace(/^[\s\r\n\t]+|[\s\r\n\t]+$/g,""); }
  /** Strip Blinking Cursor Typewriter cursor chars from start/end (expression uses reveal + c[d-1], c = ["|","_","—","<",">","«","»","^"]). */
  function stripBlinkingCursorCursor(s) {
    if (!s || typeof s !== "string") return "";
    s = s.replace(/[\|\u005f\u2014<>«»\u005e]\s*$/g, "").replace(/^\s*[\|\u005f\u2014<>«»\u005e]/g, "");
    return trim(s);
  }
  function alertIf(s){ try{ alert(s); }catch(e){} }
  function run(cmd){ try{ return system.callSystem(cmd) || ""; }catch(e){ return ""; } }

  function tryCompressPngForUpload(pngFile, highQualityOrProfile){
    if (IS_WIN || !pngFile || !pngFile.exists) return;
    var profile = (highQualityOrProfile === true) ? "skip" : (highQualityOrProfile === false ? "normal" : (highQualityOrProfile || "normal"));
    if (profile === "skip") return;
    var qBand = (profile === "high") ? "90-100" : (profile === "low" ? "50-75" : (profile === "min" ? "35-55" : "75-92"));
    var tmpPath = pngFile.fsName + ".q.png";
    try {
      run("optipng -o2 \"" + pngFile.fsName + "\" 2>/dev/null");
    } catch (e) {}
    try {
      run("pngquant -f --quality " + qBand + " -o \"" + tmpPath + "\" \"" + pngFile.fsName + "\" 2>/dev/null");
      var tmpF = new File(tmpPath);
      if (tmpF.exists && tmpF.length > 0) {
        pngFile.remove();
        run("mv \"" + tmpPath + "\" \"" + pngFile.fsName + "\"");
      } else { try { tmpF.remove(); } catch(e){} }
    } catch (e) {}
  }
  function readTextFile(f){
    try{ f.encoding="UTF-8"; if(!f.open("r")) return ""; var t=f.read(); f.close(); return t; }
    catch(e){ try{f.close();}catch(_){} return ""; }
  }
  function writeTextFile(f, txt){
    try{ f.encoding="UTF-8"; f.lineFeed="Unix"; if(!f.open("w")) return false; f.write(txt); f.close(); return true; }
    catch(e){ try{f.close();}catch(_){} return false; }
  }
  /** Binary-safe copy for .jsxbin release assets (ExtendScript). */
  function copyFileBinary(src, dst) {
    try {
      if (!src || !src.exists) return false;
      var d = dst instanceof File ? dst : new File(dst);
      if (d.exists) { try { d.remove(); } catch (e0) {} }
      return src.copy(d);
    } catch (e) { return false; }
  }
  function isJsxbinAssetName(nm) {
    return /\.jsxbin$/i.test(String(nm || ""));
  }
  function isPlausibleJsxbinFile(f) {
    try {
      if (!f || !f.exists) return false;
      var n = Number(f.length);
      if (isNaN(n) || n < 8000) return false;
      return true;
    } catch (e) { return false; }
  }
  function localFileName(f) {
    try {
      var s = String(f && f.fsName ? f.fsName : "");
      var ix = s.lastIndexOf("/");
      if (ix < 0) ix = s.lastIndexOf("\\");
      return ix >= 0 ? s.substring(ix + 1) : s;
    } catch (e) { return ""; }
  }
  /** Windows only: append one line to Crowdin_scan_debug.txt (Documents). Use to pinpoint where scan/send crashes; "file not found" is often AE crash after system.callSystem, not a missing file. */
  function scanDebugLog(msg) {
    if (!IS_WIN) return;
    try {
      var f = new File(Folder.myDocuments.fsName + "/Crowdin_scan_debug.txt");
      f.encoding = "UTF-8";
      f.open("a");
      f.write(msg + "\r\n");
      f.close();
    } catch (e) {}
  }
  /** Normalize AE paragraph/soft breaks for TMS export (keeps line breaks, stable JSON). */
  function normalizeTextForTmsExport(s) {
    if (s === null || s === undefined) return "";
    s = "" + s;
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return s;
  }

  /** Strict JSON string escape (required for multiline text layers and C0 control chars from AE). */
  function jsonEscape(s){
    if (s===null || s===undefined) return "";
    s = normalizeTextForTmsExport(s);
    var out = "";
    var i, c, code, hex;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      code = s.charCodeAt(i);
      if (c === "\\") out += "\\\\";
      else if (c === "\"") out += "\\\"";
      else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else if (code === 0x2028) out += "\\u2028";
      else if (code === 0x2029) out += "\\u2029";
      else if (code < 32) {
        hex = code.toString(16);
        while (hex.length < 4) hex = "0" + hex;
        out += "\\u" + hex;
      } else out += c;
    }
    return out;
  }

  function normalizeHttpCode(raw){
    raw = trim(raw || "");
    var m = raw.match(/HTTP\/\S+\s+(\d{3})\b/);
    if (m && m[1]) return m[1];
    m = raw.match(/(\d{3})/);
    if (m && m[1]) return m[1];
    return raw;
  }

  /** Parse status from curl --dump-header file (last HTTP/x.x line wins when -L follows redirects). */
  function readHttpCodeFromCurlResult(httpFile, headerFile){
    if (headerFile && headerFile.exists) {
      var head = readTextFile(headerFile);
      if (head && head.length) {
        var lines = head.split(/\r?\n/);
        var i, lastStatus = "";
        for (i = 0; i < lines.length; i++) {
          if (/^HTTP\//i.test(lines[i])) lastStatus = lines[i];
        }
        if (lastStatus) return normalizeHttpCode(lastStatus);
        return normalizeHttpCode(lines[0] || head);
      }
    }
    return normalizeHttpCode(httpFile ? readTextFile(httpFile) : "");
  }

  function openUrl(url){
    if (!url) return;
    try{
      if (IS_WIN) {
        /* Hidden cmd /c start often fails to raise the browser; Shell.Run(https…) avoids cmd entirely (no flash, OAuth works). */
        var u = String(url).replace(/"/g, "");
        var sh = new ActiveXObject("WScript.Shell");
        sh.Run(u, 1, false);
      }
      else run('/usr/bin/open "' + url + '"');
    }catch(e){
      try {
        if (IS_WIN) run('cmd /c start "" "' + String(url).replace(/"/g, "") + '"');
        else throw e;
      } catch (e2) {
        alertIf("Open this URL in your browser:\n\n" + url);
      }
    }
  }

  function getDeviceId(){
    var name;
    if (IS_WIN) {
      try { name = trim(run("hostname")); } catch (e) { name = ""; }
    } else {
      name = trim(run("/usr/sbin/scutil --get ComputerName"));
      if (!name) name = trim(run("/bin/hostname"));
    }
    if (!name) name = "unknown-device";
    return name.replace(/[\r\n\t"']/g, " ").replace(/\x60/g, " ");
  }

  function ensureCurl(){
    var cv = run(CURL + " -V");
    if (!cv || cv.toLowerCase().indexOf("curl") === -1) {
      alertIf("curl not found.\nCheck AE Prefs: 'Allow Scripts to Write Files and Access Network'.");
      return false;
    }
    return true;
  }

  /** On Windows, use forward slashes in curl args (matches Cult Translator; avoids parser quirks with system.callSystem). */
  function pathForCurl(path) {
    if (!path || !IS_WIN) return path;
    return String(path).replace(/\\/g, "/");
  }
  /** Cross-platform temp file path. Uses Folder.temp (e.g. %TEMP% on Windows, /var/folders/... or /tmp on Mac) with OS separator so AE File and curl both get a valid path. */
  function tempPath(name) {
    var sep = IS_WIN ? "\\" : "/";
    return Folder.temp.fsName + sep + name;
  }

  function getActiveComp(){
    var c = app.project && app.project.activeItem;
    if (!c || !(c instanceof CompItem)) { alertIf("Open/select a composition first."); return null; }
    return c;
  }

  /** Collect all compositions from the project (root folder, recursive). */
  function getAllCompsInProject() {
    var out = [];
    try {
      function collect(folder) {
        if (!folder || typeof folder.numItems !== "number") return;
        for (var i = 1; i <= folder.numItems; i++) {
          try {
            var item = folder.item(i);
            if (!item) continue;
            if (item instanceof CompItem) out.push(item);
            if (item instanceof FolderItem) collect(item);
          } catch (e) {}
        }
      }
      collect(app.project.rootFolder);
    } catch (e) {}
    return out;
  }

  /**
   * Try to bring the Project panel to front so app.project.selection is populated.
   * When a ScriptUI panel has focus, app.project.selection is often empty; executing
   * the "Project" window command then sleeping briefly can restore selection for reading.
   * No-op if executeCommand is unavailable or fails (getSelectedComps will fall back to activeItem).
   */
  function tryFocusProjectPanelForSelection() {
    try {
      if (typeof app.findMenuCommandId !== "function" || typeof app.executeCommand !== "function") return;
      var cmdId = app.findMenuCommandId("Project");
      if (cmdId && typeof cmdId === "number" && cmdId > 0) {
        app.executeCommand(cmdId);
        $.sleep(150);
      }
    } catch (e) {}
  }

  /** Read compositions from Project panel: selection (CompItems only), or activeItem if none selected. Does not use compsToSend list. */
  function getSelectionFromProjectPanel() {
    tryFocusProjectPanelForSelection();
    var sel = [];
    try {
      if (app.project.selection && app.project.selection.length > 0) {
        for (var i = 0; i < app.project.selection.length; i++) {
          if (app.project.selection[i] instanceof CompItem) sel.push(app.project.selection[i]);
        }
      }
    } catch (e) {}
    if (sel.length === 0) {
      try {
        var c = app.project && app.project.activeItem;
        if (c && c instanceof CompItem) sel.push(c);
      } catch (e2) {}
    }
    return sel;
  }

  /** Return compositions to export: compsToSend list if non-empty (resolved by id), else selection/active from Project panel. */
  function getSelectedComps() {
    if (typeof compCheckboxes !== "undefined" && compCheckboxes && compCheckboxes.length > 0) {
      var out = [];
      for (var i = 0; i < compCheckboxes.length; i++) {
        if (compCheckboxes[i].cb.value === true) out.push(compCheckboxes[i].comp);
      }
      if (out.length > 0) return out;
    }
    if (STATE.compsToSend && STATE.compsToSend.length > 0) {
      var resolved = [];
      for (var j = 0; j < STATE.compsToSend.length; j++) {
        var comp = findCompById(STATE.compsToSend[j]);
        if (comp && comp instanceof CompItem) resolved.push(comp);
      }
      if (resolved.length > 0) return resolved;
    }
    return getSelectionFromProjectPanel();
  }

  /** Safe file key for Crowdin (used as filename base).
   *  Preserves spaces and all Unicode letters (e.g. ç, ã, Chinese, Arabic),
   *  only replacing characters that are truly unsafe in file names or URLs
   *  (slashes, colons, wildcards, control characters, etc.).
   *
   *  Note: on Windows we now keep the Unicode name for Crowdin fileKey, and rely on
   *  safeScreenshotBase only for the PNG/ssName filenames so that friendly names
   *  like "Coração" still appear correctly in Crowdin while filesystem paths stay safe.
   */
  function safeFileKeyForComp(comp) {
    try {
      var nameRaw = (comp && comp.name != null) ? String(comp.name) : "";
      var name = nameRaw.replace(/^\s+|\s+$/g, "");
      if (name === "") return "comp_" + comp.id;
      var badChars = "\\/:*?\"<>|\t\n\r"; // keep spaces; only strip path-breaking characters
      var s = "";
      var i, ch, prevUnderscore = false;
      for (i = 0; i < name.length; i++) {
        ch = name.charAt(i);
        if (badChars.indexOf(ch) >= 0) {
          if (!prevUnderscore) { s += "_"; prevUnderscore = true; }
        } else {
          s += ch;
          prevUnderscore = false;
        }
      }
      s = s.replace(/^_+/, "").replace(/_+$/, "");
      return s.length > 0 ? s : "comp_" + comp.id;
    } catch (e) { return comp ? "comp_" + comp.id : ""; }
  }

  /** Find a composition in the project by id (number or string). Searches root, folders, and flat list. Returns comp or null. */
  function findCompById(compId) {
    try {
      if (compId == null || compId === "") return null;
      var id = parseInt(compId, 10);
      if (!isFinite(id)) return null;
      function searchFolder(folder) {
        try {
          if (!folder || typeof folder.numItems !== "number") return null;
          for (var i = 1; i <= folder.numItems; i++) {
            var item = folder.item(i);
            if (!item) continue;
            if (item instanceof CompItem && item.id == id) return item;
            if (item instanceof FolderItem) {
              var found = searchFolder(item);
              if (found) return found;
            }
          }
        } catch (e2) {}
        return null;
      }
      var found = searchFolder(app.project.rootFolder);
      if (found) return found;
      var n = app.project.numItems;
      if (typeof n === "number") {
        for (var j = 1; j <= n; j++) {
          try {
            var it = app.project.item(j);
            if (it && (it instanceof CompItem) && it.id == id) return it;
          } catch (e3) {}
        }
      }
      if (app.project.items && typeof app.project.items.length === "number") {
        for (var k = 0; k < app.project.items.length; k++) {
          try {
            var it2 = app.project.items[k] || app.project.items[k + 1];
            if (it2 && (it2 instanceof CompItem) && it2.id == id) return it2;
          } catch (e4) {}
        }
      }
      return null;
    } catch (e) { return null; }
  }

  /** Same logic as File > Scripts > Scale Composition.jsx: parent all unparented layers to newParent. */
  function makeParentLayerOfAllUnparented(theComp, newParent) {
    for (var i = 1; i <= theComp.numLayers; i++) {
      var curLayer = theComp.layer(i);
      if (curLayer !== newParent && curLayer.parent === null) curLayer.parent = newParent;
    }
  }

  /** Scale every camera zoom by scaleBy (same as Scale Composition.jsx). */
  function scaleAllCameraZooms(theComp, scaleBy) {
    for (var i = 1; i <= theComp.numLayers; i++) {
      var curLayer = theComp.layer(i);
      if (curLayer.matchName === "ADBE Camera Layer") {
        var curZoom = curLayer.zoom;
        if (curZoom.numKeys === 0) curZoom.setValue(curZoom.value * scaleBy);
        else for (var j = 1; j <= curZoom.numKeys; j++) curZoom.setValueAtKey(j, curZoom.keyValue(j) * scaleBy);
      }
    }
  }

  /**
   * Scale composition by factor — same algorithm as File > Scripts > Scale Composition.jsx
   * (temp null parent, resize comp, scale null, then remove null). Uses beginUndoGroup/endUndoGroup
   * so the whole operation is one undo step (Ctrl+Z reverts the scale without ever showing the null).
   * Uses try/finally so the temp null is always removed.
   */
  function scaleCompositionByFactor(comp, scaleFactor) {
    if (!comp || !(comp instanceof CompItem) || scaleFactor <= 0 || scaleFactor === 1) return false;
    var newW = Math.floor(comp.width * scaleFactor), newH = Math.floor(comp.height * scaleFactor);
    if (newW < 1 || newH < 1 || newW > 30000 || newH > 30000) return false;
    var null3DLayer = null;
    var undoStarted = false;
    try {
      if (typeof app.beginUndoGroup === "function") {
        app.beginUndoGroup("Scale Composition");
        undoStarted = true;
      }
      null3DLayer = comp.layers.addNull();
      null3DLayer.threeDLayer = true;
      null3DLayer.position.setValue([0, 0, 0]);
      makeParentLayerOfAllUnparented(comp, null3DLayer);
      comp.width = newW;
      comp.height = newH;
      scaleAllCameraZooms(comp, scaleFactor);
      var superParentScale = null3DLayer.scale.value;
      superParentScale[0] = superParentScale[0] * scaleFactor;
      superParentScale[1] = superParentScale[1] * scaleFactor;
      superParentScale[2] = superParentScale[2] * scaleFactor;
      null3DLayer.scale.setValue(superParentScale);
      return true;
    } catch (e) {
      return false;
    } finally {
      if (null3DLayer != null) {
        try { null3DLayer.remove(); } catch (eRemove) {}
      }
      if (undoStarted && typeof app.endUndoGroup === "function") app.endUndoGroup();
    }
  }

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  /**
   * Effective time window to scan in a comp.
   * If the user shortened the work area, we only scan inside it; otherwise we use the full duration.
   */
  function getCompScanWindow(comp) {
    var duration = 0;
    try { duration = Math.max(0, Number(comp.duration || 0)); } catch (e) { duration = 0; }

    var start = 0;
    var end = duration > 0 ? duration : 0;

    try {
      var waStart = Number(comp.workAreaStart);
      var waDur   = Number(comp.workAreaDuration);
      if (isFinite(waStart) && isFinite(waDur) && waDur > 0.01) {
        var waEnd = waStart + waDur;
        if (duration > 0) {
          if (waStart < 0) waStart = 0;
          if (waEnd > duration) waEnd = duration;
        }
        // Only treat work area as a limit when it is actually shorter than the full comp.
        if (duration <= 0 || (waEnd - waStart) < (duration - 0.01)) {
          start = waStart;
          end = waEnd;
        }
      }
    } catch (e2) {}

    if (end < start + 0.01) end = start + 0.01;
    return { start: start, end: end };
  }

  // MINI JSON stringify
  function jsonStringifyMini(v){
    var t = typeof v;
    if (v === null || v === undefined) return "null";
    if (t === "string") return '"' + jsonEscape(v) + '"';
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (v instanceof Array) {
      var a = [];
      for (var i=0;i<v.length;i++) a[a.length] = jsonStringifyMini(v[i]);
      return "[" + a.join(",") + "]";
    }
    if (t === "object") {
      var parts = [];
      for (var k in v) {
        if (!v.hasOwnProperty(k)) continue;
        parts[parts.length] = '"' + jsonEscape(k) + '":' + jsonStringifyMini(v[k]);
      }
      return "{" + parts.join(",") + "}";
    }
    return "null";
  }

  function extractJsonField(body, field){
    try{
      var re = new RegExp('"' + field + '"\\s*:\\s*"([^"]*)"', "i");
      var m = (String(body||"")).match(re);
      return (m && m[1]) ? m[1] : "";
    }catch(e){}
    return "";
  }

  function parseProjects(body){
    body = String(body || "").replace(/^\uFEFF/, "");
    var out = [];
    try {
      var parsed = JSON.parse(body);
      var list = null;
      if (parsed && parsed.projects && parsed.projects.length !== undefined) list = parsed.projects;
      else if (parsed && parsed.content && parsed.content.length !== undefined) list = parsed.content;
      else if (parsed && parsed.length !== undefined) list = parsed;
      if (list) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          if (!p) continue;
          var pid = (p.id != null && p.id !== "") ? p.id : ((p.uid != null && p.uid !== "") ? p.uid : p.projectUid);
          if (pid == null || pid === "") continue;
          var pname = p.name || p.projectName || p.title || String(pid);
          var pweb = (p.webUrl != null && p.webUrl !== "") ? String(p.webUrl) : "";
          var pident = (p.identifier != null && p.identifier !== "") ? String(p.identifier) : "";
          out[out.length] = { id: String(pid), name: String(pname), webUrl: pweb, identifier: pident };
        }
        if (out.length) return out;
      }
    } catch (eJson) {}
    var reNum = /"id"\s*:\s*(\d+)\s*,\s*"name"\s*:\s*"([^"]*)"/g;
    var reStr = /"id"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]*)"/g;
    var reUid = /"uid"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]*)"/g;
    var m;
    while ((m = reNum.exec(body)) !== null) out[out.length] = { id: String(m[1]), name: String(m[2]) };
    if (out.length) return out;
    while ((m = reStr.exec(body)) !== null) out[out.length] = { id: String(m[1]), name: String(m[2]) };
    if (out.length) return out;
    while ((m = reUid.exec(body)) !== null) out[out.length] = { id: String(m[1]), name: String(m[2]) };
    return out;
  }

  function parseLanguages(body){
    body = String(body || "");
    var out = [];
    var re = /"id"\s*:\s*"([^"]+)"[^}]*"name"\s*:\s*"([^"]*)"/g;
    var m;
    while ((m = re.exec(body)) !== null) out[out.length] = { id: String(m[1]), name: String(m[2]) };
    return out;
  }

  function parsePullItems(body){
    body = String(body || "");
    var out = [];
    try {
      var parsed = JSON.parse(body.replace(/^\uFEFF/, ""));
      if (parsed && parsed.length !== undefined) {
        for (var pi = 0; pi < parsed.length; pi++) {
          var it = parsed[pi];
          if (!it || it.id == null) continue;
          out[out.length] = {
            id: String(it.id),
            translatedText: String(it.translatedText == null ? "" : it.translatedText)
          };
        }
        if (out.length) return out;
      }
    } catch (eJson) {}
    var re = /"id"\s*:\s*"([^"]+)"[^}]*"translatedText"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    var m;
    while ((m = re.exec(body)) !== null) {
      var txt = m[2];
      txt = txt.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
      out[out.length] = { id: String(m[1]), translatedText: txt };
    }
    return out;
  }

  function hasAnyPseudoFiles(filesObj) {
    if (!filesObj) return false;
    for (var k in filesObj) {
      if (!filesObj.hasOwnProperty(k)) continue;
      if (filesObj[k] && filesObj[k].length > 0) return true;
    }
    return false;
  }

  /** Parse ae/pseudo-translate JSON; ExtendScript JSON.parse often fails on Unicode in pseudo strings. */
  function parsePseudoTranslateResponse(body, fileKeys) {
    body = String(body || "").replace(/^\uFEFF/, "");
    try {
      var data = JSON.parse(body);
      if (data && data.files && typeof data.files === "object") return data;
    } catch (eJson) {}

    var out = { ok: false, buildId: 0, files: {}, missing: [] };
    if (/"ok"\s*:\s*true/i.test(body)) out.ok = true;
    var buildM = body.match(/"buildId"\s*:\s*(\d+)/);
    if (buildM && buildM[1]) out.buildId = parseInt(buildM[1], 10);

    var keys = fileKeys || [];
    for (var ki = 0; ki < keys.length; ki++) {
      var fk = String(keys[ki] || "");
      if (!fk.length) continue;
      var esc = fk.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      var re = new RegExp('"' + esc + '"\\s*:\\s*\\[', "i");
      var m = re.exec(body);
      if (!m) {
        out.missing.push(fk);
        continue;
      }
      var start = m.index + m[0].length - 1;
      var depth = 0;
      var end = start;
      for (var i = start; i < body.length; i++) {
        var ch = body.charAt(i);
        if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      var items = parsePullItems(body.substring(start, end));
      if (items && items.length) out.files[fk] = items;
      else out.missing.push(fk);
    }
    if (!hasAnyPseudoFiles(out.files)) {
      var allItems = parsePullItems(body);
      if (allItems.length && keys.length === 1) out.files[keys[0]] = allItems;
    }
    if (hasAnyPseudoFiles(out.files)) out.ok = true;
    return out;
  }

  function lookupPseudoFileItems(pseudoItemsByFileKey, fileKey) {
    if (!pseudoItemsByFileKey || !fileKey) return null;
    if (pseudoItemsByFileKey[fileKey] && pseudoItemsByFileKey[fileKey].length) return pseudoItemsByFileKey[fileKey];
    var fkLow = String(fileKey).toLowerCase();
    for (var k in pseudoItemsByFileKey) {
      if (!pseudoItemsByFileKey.hasOwnProperty(k)) continue;
      if (String(k).toLowerCase() === fkLow && pseudoItemsByFileKey[k] && pseudoItemsByFileKey[k].length) {
        return pseudoItemsByFileKey[k];
      }
    }
    return null;
  }

  function isGzipCompressedBody(body) {
    try {
      body = String(body || "");
      return body.length >= 2 && body.charCodeAt(0) === 0x1f && body.charCodeAt(1) === 0x8b;
    } catch (e) { return false; }
  }

  // HTTP (curl) — --compressed so CDN/nginx gzip responses are decompressed (fixes empty project lists).
  function curlGet(url){
    var TMP = Folder.temp;
    var TS  = "" + (new Date().getTime());
    var RES = new File(TMP.fsName + "/ct_get_" + TS + ".txt");
    var HTTP= new File(TMP.fsName + "/ct_get_" + TS + ".http.txt");
    var HEAD= new File(TMP.fsName + "/ct_get_" + TS + ".head.txt");
    var ERR = new File(TMP.fsName + "/ct_get_" + TS + ".err.txt");

    var DEVICE_ID = getDeviceId();

    var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS --compressed ' +
              '--connect-timeout 10 --max-time 60 ' +
              '-H "x-license-key: ' + getLicenseHeaderForRequest() + '" ' +
              '-H "x-device-id: ' + DEVICE_ID + '" ' +
              '-H "x-device-name: ' + DEVICE_ID + '" ' +
              '-o "' + pathForCurl(RES.fsName) + '" "' + url + '" ';
    if (IS_WIN)
      cmd += '-D "' + pathForCurl(HEAD.fsName) + '" 2> "' + pathForCurl(ERR.fsName) + '"';
    else
      cmd += '-w "' + CURL_HTTP_CODE + '" > "' + HTTP.fsName + '" 2> "' + ERR.fsName + '"';

    run(cmd);

    var http = readHttpCodeFromCurlResult(HTTP, HEAD);
    var body = readTextFile(RES);
    if (isGzipCompressedBody(body)) {
      try { RES.remove(); } catch (eRm) {}
      var cmd2 = CURL + ' -4 --http1.1 --noproxy "*" -sS --compressed ' +
                '--connect-timeout 10 --max-time 60 ' +
                '-H "Accept-Encoding: identity" ' +
                '-H "x-license-key: ' + getLicenseHeaderForRequest() + '" ' +
                '-H "x-device-id: ' + DEVICE_ID + '" ' +
                '-H "x-device-name: ' + DEVICE_ID + '" ' +
                '-o "' + pathForCurl(RES.fsName) + '" "' + url + '" ';
      if (IS_WIN)
        cmd2 += '-D "' + pathForCurl(HEAD.fsName) + '" 2> "' + pathForCurl(ERR.fsName) + '"';
      else
        cmd2 += '-w "' + CURL_HTTP_CODE + '" > "' + HTTP.fsName + '" 2> "' + ERR.fsName + '"';
      run(cmd2);
      http = readHttpCodeFromCurlResult(HTTP, HEAD);
      body = readTextFile(RES);
    }

    try{ RES.remove(); }catch(e){}
    try{ HTTP.remove(); }catch(e){}
    try{ HEAD.remove(); }catch(e){}
    try{ ERR.remove(); }catch(e){}

    return { http:http, body:body };
  }

  function curlPostJson(url, jsonBody, maxTimeSecOpt){
    var TMP = Folder.temp;
    var TS  = "" + (new Date().getTime());
    var REQ = new File(TMP.fsName + "/ct_post_" + TS + ".json");
    var RES = new File(TMP.fsName + "/ct_post_" + TS + ".txt");
    var HTTP= new File(TMP.fsName + "/ct_post_" + TS + ".http.txt");
    var HEAD= new File(TMP.fsName + "/ct_post_" + TS + ".head.txt");
    var ERR = new File(TMP.fsName + "/ct_post_" + TS + ".err.txt");

    if (!writeTextFile(REQ, jsonBody)) return { http:"", body:"" };

    var DEVICE_ID = getDeviceId();
    var maxT = (maxTimeSecOpt != null && Number(maxTimeSecOpt) > 0) ? Number(maxTimeSecOpt) : 90;

    var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS --compressed ' +
              '--connect-timeout 10 --max-time ' + maxT + ' ' +
              '-X POST ' +
              '-H "x-license-key: ' + getLicenseHeaderForRequest() + '" ' +
              '-H "x-device-id: ' + DEVICE_ID + '" ' +
              '-H "x-device-name: ' + DEVICE_ID + '" ' +
              '-H "Content-Type: application/json" ' +
              '--data-binary @"' + pathForCurl(REQ.fsName) + '" ' +
              '-o "' + pathForCurl(RES.fsName) + '" "' + url + '" ';
    if (IS_WIN)
      cmd += '-D "' + pathForCurl(HEAD.fsName) + '" 2> "' + pathForCurl(ERR.fsName) + '"';
    else
      cmd += '-w "' + CURL_HTTP_CODE + '" > "' + HTTP.fsName + '" 2> "' + ERR.fsName + '"';

    run(cmd);

    var http = readHttpCodeFromCurlResult(HTTP, HEAD);
    var body = readTextFile(RES);

    try{ REQ.remove(); }catch(e){}
    try{ RES.remove(); }catch(e){}
    try{ HTTP.remove(); }catch(e){}
    try{ HEAD.remove(); }catch(e){}
    try{ ERR.remove(); }catch(e){}

    return { http:http, body:body };
  }

  /** Phrase TMS: after deferred ae/strings + ae/scan-frame, create jobs with Live Preview under Context note. */
  /** Phrase: pre-translate jobs (Language AI / project MT), wait until targets are ready for pull. */
  function phraseRunAutoTranslate(fileKey, langIds, setStatus){
    if (TMS_PROVIDER !== "phrase") return false;
    fileKey = trim(fileKey || "");
    if (!fileKey || !STATE.projectId) return false;
    if (!langIds || !langIds.length) return false;
    setStatus("AI Translation: sending to Phrase…");
    var body = '{' +
      '"projectId":"' + jsonEscape(STATE.projectId) + '",' +
      '"fileKey":"' + jsonEscape(fileKey) + '",' +
      '"targetLangs":' + jsonStringifyMini(langIds) +
    '}';
    var r = curlPostJson(EP_AUTO_TRANSLATE, body, 360);
    if (r.http !== "200") {
      setStatus("AI Translation failed.");
      alertIf("AI Translation failed.\nHTTP " + (r.http || "?") + "\n\n" + (r.body || ""));
      return false;
    }
    try {
      var data = JSON.parse(r.body || "{}");
      if (data && data.ok === false) {
        alertIf("AI Translation did not complete.\n\n" + (r.body || ""));
        return false;
      }
    } catch (eParse) {}
    return true;
  }

  /** Crowdin: pseudo-localization build + extract WebXML per fileKey (one project build). */
  function crowdinRunPseudoTranslate(fileKeys, setStatus){
    if (TMS_PROVIDER === "phrase") return null;
    if (!fileKeys || !fileKeys.length || !STATE.projectId) return null;
    setStatus("Pseudo Translation: building on Crowdin…");
    var body = jsonStringifyMini({ projectId: STATE.projectId, fileKeys: fileKeys });
    var r = curlPostJson(EP_PSEUDO_TRANSLATE, body, 360);
    if (r.http !== "200") {
      setStatus("Pseudo Translation failed.");
      alertIf("Pseudo Translation failed.\nHTTP " + (r.http || "?") + "\n\n" + (r.body || ""));
      return null;
    }
    var data = parsePseudoTranslateResponse(r.body || "", fileKeys);
    if (!data || data.ok === false || !hasAnyPseudoFiles(data.files)) {
      alertIf("Pseudo Translation did not complete.\n\n" + (r.body || ""));
      return null;
    }
    if (data.missing && data.missing.length) {
      alertIf("Pseudo Translation: no file in Crowdin for:\n" + data.missing.join("\n") + "\n\nSend compositions first, then retry.");
    }
    return data;
  }

  function phraseAePublishExport(fileKeyArg){
    if (TMS_PROVIDER !== "phrase") return true;
    if (!STATE.projectId || !fileKeyArg) return true;
    var body = jsonStringifyMini({ projectId: STATE.projectId, fileKey: String(fileKeyArg || "") });
    var r = curlPostJson(EP_PUBLISH, body, 180);
    if (!r || r.http !== "200"){
      try {
        alertIf("Phrase TMS: Finalize preview/job failed.\nHTTP " + (r && r.http != null ? r.http : "?") + "\n\n" + (r && r.body ? String(r.body) : ""));
      } catch (ePub) {}
      return false;
    }
    return true;
  }

  function curlPostMultipart(url, fields, files){
    var TMP = Folder.temp;
    var TS  = "" + (new Date().getTime());
    var RES = new File(TMP.fsName + "/ct_mp_" + TS + ".txt");
    var HTTP= new File(TMP.fsName + "/ct_mp_" + TS + ".http.txt");
    var HEAD= new File(TMP.fsName + "/ct_mp_" + TS + ".head.txt");
    var ERR = new File(TMP.fsName + "/ct_mp_" + TS + ".err.txt");

    var DEVICE_ID = getDeviceId();

    var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS ' +
              '--connect-timeout 10 --max-time 180 ' +
              '-X POST ' +
              '-H "x-license-key: ' + getLicenseHeaderForRequest() + '" ' +
              '-H "x-device-id: ' + DEVICE_ID + '" ' +
              '-H "x-device-name: ' + DEVICE_ID + '" ';

    var i;
    for (i=0;i<fields.length;i++){
      cmd += '-F "' + fields[i].name + '=' + jsonEscape(fields[i].value) + '" ';
    }
    for (i=0;i<files.length;i++){
      var part = files[i].name + '=@' + pathForCurl(files[i].path);
      if (files[i].filename) part += ';filename=' + files[i].filename;
      part += ';type=' + (files[i].mime||'application/octet-stream');
      cmd += '-F "' + part + '" ';
    }

    if (IS_WIN && files.length) {
      try {
        var dbg = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt");
        dbg.encoding = "UTF-8";
        dbg.open("a");
        dbg.write("\r\n--- curlPostMultipart (Windows, direct curl via callSystem) ---\r\n");
        dbg.write("curl: " + CURL + "\r\n");
        for (i = 0; i < files.length; i++) {
          dbg.write("files[" + i + "].path: " + files[i].path + "\r\n");
          dbg.write("pathForCurl: " + pathForCurl(files[i].path) + "\r\n");
        }
        dbg.close();
      } catch (eDbg) {}
    }

    cmd += '-o "' + pathForCurl(RES.fsName) + '" "' + url + '" ';
    if (IS_WIN)
      cmd += '-D "' + pathForCurl(HEAD.fsName) + '" 2> "' + pathForCurl(ERR.fsName) + '"';
    else
      cmd += '-w "' + CURL_HTTP_CODE + '" > "' + pathForCurl(HTTP.fsName) + '" 2> "' + pathForCurl(ERR.fsName) + '"';

    run(cmd);

    var http = "", body = "";
    try {
      http = readHttpCodeFromCurlResult(HTTP, IS_WIN ? HEAD : null);
      body = RES.exists ? readTextFile(RES) : "";
    } catch (e) {
      try {
        var d = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt");
        d.encoding = "UTF-8";
        d.open("a");
        d.write("\r\n[curlPostMultipart read error] " + (e && e.message ? e.message : String(e)) + "\r\n");
        d.close();
      } catch (e2) {}
    }

    try{ RES.remove(); }catch(e){}
    try{ HTTP.remove(); }catch(e){}
    try{ HEAD.remove(); }catch(e){}
    try{ ERR.remove(); }catch(e){}

    return { http: http || "", body: body || "" };
  }

  // -----------------------------
  // Updates (GitHub Releases)
  // -----------------------------
  function parseSemver(v) {
    v = String(v || "").replace(/^\s+|\s+$/g, "");
    if (v.charAt(0) === "v" || v.charAt(0) === "V") v = v.substring(1);
    // major.minor.patch or major.minor.patch.build (e.g. 1.1.1.1)
    var m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return { major: 0, minor: 0, patch: 0, build: 0, raw: v, ok: false };
    return {
      major: parseInt(m[1], 10),
      minor: parseInt(m[2], 10),
      patch: parseInt(m[3], 10),
      build: m[4] ? parseInt(m[4], 10) : 0,
      raw: v,
      ok: true
    };
  }

  function compareSemver(a, b) {
    // Returns -1 if a<b, 0 if equal, 1 if a>b
    if (!a || !a.ok) a = parseSemver(a && a.raw ? a.raw : a);
    if (!b || !b.ok) b = parseSemver(b && b.raw ? b.raw : b);
    if (a.major !== b.major) return a.major < b.major ? -1 : 1;
    if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
    if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
    if (a.build !== b.build) return a.build < b.build ? -1 : 1;
    return 0;
  }

  // GitHub update requests should not include proxy/license headers.
  function curlGetPlain(url, extraHeaders) {
    var TMP = Folder.temp;
    var TS  = "" + (new Date().getTime());
    var RES = new File(TMP.fsName + "/ct_uget_" + TS + ".txt");
    var HEAD= new File(TMP.fsName + "/ct_uget_" + TS + ".head.txt");
    var ERR = new File(TMP.fsName + "/ct_uget_" + TS + ".err.txt");

    var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS ' +
              '--connect-timeout 10 --max-time 60 ';
    if (extraHeaders && extraHeaders.length) {
      for (var i = 0; i < extraHeaders.length; i++) {
        cmd += '-H "' + String(extraHeaders[i]).replace(/"/g, '\\"') + '" ';
      }
    }
    cmd += '-H "Accept-Encoding: identity" ';
    cmd += '-D "' + pathForCurl(HEAD.fsName) + '" ';
    cmd += '-o "' + pathForCurl(RES.fsName) + '" ';
    cmd += '"' + url + '" ';
    if (IS_WIN)
      cmd += '2> "' + pathForCurl(ERR.fsName) + '"';
    else
      cmd += '2> "' + ERR.fsName + '"';

    run(cmd);

    var http = readHttpCodeFromCurlResult(null, HEAD);
    var body = readTextFile(RES);
    var err  = readTextFile(ERR);
    try{ RES.remove(); }catch(e){}
    try{ HEAD.remove(); }catch(e){}
    try{ ERR.remove(); }catch(e){}
    return { http: http, body: body, err: err };
  }

  function curlDownloadPlain(url, outFile, extraHeaders) {
    if (!outFile) return { http: "", err: "No outFile" };
    var TMP = Folder.temp;
    var TS  = "" + (new Date().getTime());
    var HEAD= new File(TMP.fsName + "/ct_udl_" + TS + ".head.txt");
    var ERR = new File(TMP.fsName + "/ct_udl_" + TS + ".err.txt");

    var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS -L ' +
              '--connect-timeout 10 --max-time 180 ';
    if (extraHeaders && extraHeaders.length) {
      for (var i = 0; i < extraHeaders.length; i++) {
        cmd += '-H "' + String(extraHeaders[i]).replace(/"/g, '\\"') + '" ';
      }
    }
    cmd += '-H "Accept-Encoding: identity" ';
    cmd += '-D "' + pathForCurl(HEAD.fsName) + '" ';
    cmd += '-o "' + pathForCurl(outFile.fsName) + '" ';
    cmd += '"' + url + '" ';
    if (IS_WIN)
      cmd += '2> "' + pathForCurl(ERR.fsName) + '"';
    else
      cmd += '2> "' + ERR.fsName + '"';

    run(cmd);

    var http = readHttpCodeFromCurlResult(null, HEAD);
    var err  = readTextFile(ERR);
    try{ HEAD.remove(); }catch(e){}
    try{ ERR.remove(); }catch(e){}
    return { http: http, err: err };
  }

  function unescapeJsonStringFragment(s) {
    if (!s) return "";
    return String(s)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }

  /**
   * ExtendScript JSON.parse often fails on large GitHub /releases/latest payloads.
   * Extract tag_name, html_url, and release assets (name + browser_download_url) without full parse.
   */
  function parseGithubLatestReleaseLoose(raw) {
    try {
      raw = String(raw || "");
      var tag_name = "";
      var tm = raw.match(/"tag_name"\s*:\s*"(([^"\\]|\\.)*)"/);
      if (tm) tag_name = tm[1];
      var html_url = "";
      var hm = raw.match(/"html_url"\s*:\s*"(([^"\\]|\\.)*)"/);
      if (hm) html_url = hm[1];

      var releaseTitle = "";
      var tagPos = raw.indexOf('"tag_name"');
      if (tagPos >= 0) {
        var chunk = raw.substring(tagPos, Math.min(raw.length, tagPos + 1500));
        var nm = chunk.match(/"name"\s*:\s*"(([^"\\]|\\.)*)"/);
        if (nm) releaseTitle = nm[1];
      }

      var assets = [];
      var i = 0;
      var assetUrlKey = '{"url":"https://api.github.com/repos/';
      while (i < raw.length) {
        var uq = raw.indexOf('"browser_download_url"', i);
        if (uq < 0) break;
        var slice = raw.substring(uq, Math.min(raw.length, uq + 2048));
        var um = slice.match(/^"browser_download_url"\s*:\s*"(([^"\\]|\\.)*)"/);
        if (!um) {
          i = uq + 22;
          continue;
        }
        var dl = unescapeJsonStringFragment(um[1]);
        if (dl.indexOf("github.com") < 0 || dl.indexOf("/releases/download/") < 0) {
          i = uq + um[0].length;
          continue;
        }
        var blockStart = raw.lastIndexOf(assetUrlKey, uq);
        var fn = "";
        if (blockStart >= 0) {
          var block = raw.substring(blockStart, Math.min(raw.length, uq + 320));
          var nmm = block.match(/"name"\s*:\s*"(([^"\\]|\\.)*)"/);
          if (nmm) fn = unescapeJsonStringFragment(nmm[1]);
        }
        if (fn) assets.push({ name: fn, browser_download_url: dl });
        i = uq + um[0].length;
      }

      if (!tag_name && !assets.length) return null;
      return {
        tag_name: unescapeJsonStringFragment(tag_name),
        name: unescapeJsonStringFragment(releaseTitle),
        html_url: unescapeJsonStringFragment(html_url),
        assets: assets
      };
    } catch (eLoose) {
      return null;
    }
  }

  function pickGithubReleaseAsset(releaseJson) {
    try {
      var assets = releaseJson && releaseJson.assets ? releaseJson.assets : [];
      if (!assets || !assets.length) return null;

      var i;
      for (i = 0; i < assets.length; i++) {
        var a = assets[i];
        if (!a) continue;
        if (String(a.name || "") === UPDATE_ASSET_NAME_PREFERRED) return a;
      }
      for (i = 0; i < assets.length; i++) {
        var aBin = assets[i];
        var nmBin = String(aBin && aBin.name ? aBin.name : "");
        if (/\.jsxbin$/i.test(nmBin)) return aBin;
      }
      for (i = 0; i < assets.length; i++) {
        var a2 = assets[i];
        var nm = String(a2 && a2.name ? a2.name : "");
        if (/\.jsx$/i.test(nm)) return a2;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function getLatestReleaseInfo() {
    var apiUrl = "https://api.github.com/repos/" + encodeURIComponent(UPDATE_GITHUB_OWNER) + "/" + encodeURIComponent(UPDATE_GITHUB_REPO) + "/releases/latest";
    var headers = [
      "Accept: application/vnd.github+json",
      "User-Agent: CultExtensions-CultConnector/1.0"
    ];
    var r = curlGetPlain(apiUrl, headers);
    if (r.http !== "200") return { ok: false, http: r.http, err: r.err, body: r.body };

    var rawBody = trim(r.body || "");
    if (!rawBody) {
      return { ok: false, http: r.http, err: "Empty response from GitHub API." };
    }
    var c0 = rawBody.charAt(0);
    if (c0 === "<") {
      return { ok: false, http: r.http, err: "GitHub returned HTML (not JSON). A proxy, firewall, or SSL inspection may be rewriting the response." };
    }
    if (rawBody.length >= 2 && rawBody.charCodeAt(0) === 0x1f && rawBody.charCodeAt(1) === 0x8b) {
      return { ok: false, http: r.http, err: "Response is gzip-compressed; curl did not decompress. Try a newer macOS curl or check network tools." };
    }

    var j;
    try {
      j = JSON.parse(rawBody.replace(/^\uFEFF/, ""));
    } catch (e) {
      j = parseGithubLatestReleaseLoose(rawBody);
      if (!j || !j.assets || !j.assets.length) {
        return { ok: false, http: r.http, err: "Could not parse GitHub release JSON. First chars: " + rawBody.substring(0, 80).replace(/\r/g, "\\r").replace(/\n/g, "\\n") };
      }
    }

    var tag = String(j.tag_name || "");
    var ver = tag || String(j.name || "");
    ver = ver.replace(/^\s+|\s+$/g, "");
    if (ver.charAt(0) === "v" || ver.charAt(0) === "V") ver = ver.substring(1);
    ver = ver.replace(/^\.+/, "");

    var asset = pickGithubReleaseAsset(j);
    if (!asset) return { ok: false, http: r.http, err: "No .jsxbin or .jsx asset found in latest release." };

    if (!ver || ver.length === 0) {
      var dim = String(asset.browser_download_url || "").match(new RegExp("/releases/download/([^/]+)/"));
      if (dim) {
        ver = dim[1].replace(/^\s+|\s+$/g, "");
        if (ver.charAt(0) === "v" || ver.charAt(0) === "V") ver = ver.substring(1);
        ver = ver.replace(/^\.+/, "");
      }
    }

    return {
      ok: true,
      version: ver,
      tag: String(j.tag_name || ""),
      htmlUrl: String(j.html_url || ""),
      assetName: String(asset.name || ""),
      downloadUrl: String(asset.browser_download_url || "")
    };
  }

  function isValidUpdateScriptText(txt) {
    txt = String(txt || "");
    if (txt.length < 2000) return false;
    if (txt.indexOf("//@target aftereffects") === -1) return false;
    if (txt.indexOf("(function") === -1) return false;
    if (txt.indexOf("var SERVER_BASE") === -1) return false;
    return true;
  }

  function tryConfirm(msg) {
    try { return confirm(msg); } catch (e) {}
    try { return Window.confirm(msg); } catch (e2) {}
    return false;
  }

  function ensureFolder(folder) {
    try {
      if (!folder) return false;
      if (folder.exists) return true;
      return folder.create();
    } catch (e) { return false; }
  }

  /** True if this host object is a Folder (avoid instanceof quirks in some ExtendScript builds). */
  function isHostFolder(item) {
    try {
      return item && item.reflect && item.reflect.name === "Folder";
    } catch (e) { return false; }
  }

  /** Create folder and any missing parents (ScriptUI Panels under user Library). */
  function ensureFolderChain(folder) {
    if (!folder) return false;
    if (folder.exists) return true;
    var par = folder.parent;
    if (par && !par.exists) {
      if (!ensureFolderChain(par)) return false;
    }
    try {
      return folder.create();
    } catch (e2) { return false; }
  }

  /** After Effects application ScriptUI Panels folder (next to the .app on Mac, Support Files on Windows). */
  function getAeScriptUIPanelsInstallFolder() {
    try {
      var p = app.path;
      if (!p || typeof p !== "string") return null;
      var exe = new File(p);
      if (!exe.exists) return null;
      if (IS_WIN) {
        var sup = exe.parent;
        if (sup && sup.exists) {
          var w = new Folder(sup.fsName + "/Scripts/ScriptUI Panels");
          if (w.exists) return w;
        }
      } else {
        var macos = exe.parent;
        var contents = macos && macos.parent;
        var appBundle = contents && contents.parent;
        var installRoot = appBundle && appBundle.parent;
        if (installRoot && installRoot.exists) {
          var m = new Folder(installRoot.fsName + "/Scripts/ScriptUI Panels");
          if (m.exists) return m;
        }
        if (appBundle && appBundle.exists) {
          var inRes = new Folder(appBundle.fsName + "/Contents/Resources/Scripts/ScriptUI Panels");
          if (inRes.exists) return inRes;
          var inRoot = new Folder(appBundle.fsName + "/Contents/Scripts/ScriptUI Panels");
          if (inRoot.exists) return inRoot;
        }
      }
    } catch (e) {}
    return null;
  }

  /** Per-version user ScriptUI folders: Application Support / Adobe / After Effects / (version) / Scripts / ScriptUI Panels */
  function collectUserAeScriptUIPanelsFolders() {
    var out = [];
    try {
      var root = new Folder(Folder.userData.fsName + "/Adobe/After Effects");
      if (!root.exists) return out;
      var subs = root.getFiles();
      if (!subs) return out;
      var i, sub, panels;
      for (i = 0; i < subs.length; i++) {
        sub = subs[i];
        if (!isHostFolder(sub)) continue;
        panels = new Folder(sub.fsName + "/Scripts/ScriptUI Panels");
        if (panels.exists) out.push(panels);
      }
    } catch (e) {}
    return out;
  }

  /** User ScriptUI folder for this AE version (app.version); may not exist yet. */
  function getUserScriptUIPanelsFolderForRunningAe() {
    try {
      var v = String(app.version || "").replace(/^\s+|\s+$/g, "");
      if (!v) return null;
      var m = v.match(/^(\d+\.\d+)/);
      var shortV = m ? m[1] : v;
      var base = Folder.userData.fsName + "/Adobe/After Effects/";
      var try1 = new Folder(base + v + "/Scripts/ScriptUI Panels");
      if (try1.exists) return try1;
      var try2 = new Folder(base + shortV + "/Scripts/ScriptUI Panels");
      if (try2.exists) return try2;
      return new Folder(base + shortV + "/Scripts/ScriptUI Panels");
    } catch (e) { return null; }
  }

  function cultConnectorJsxbinBasenames() {
    return [UPDATE_PANEL_INSTALL_JSXBIN, UPDATE_PANEL_ALT_JSXBIN];
  }

  /**
   * ScriptUI .jsxbin panels often have an empty $.fileName; resolve the real install path from app.path
   * and standard filenames (same as the installer).
   */
  function resolvePanelUpdateDestination(isBin) {
    var nameBin = UPDATE_PANEL_INSTALL_JSXBIN;
    var nameJsx = UPDATE_PANEL_INSTALL_JSX;
    var altBins = cultConnectorJsxbinBasenames();
    var i, j, folders, appPanels, usr, fbin, fjsx, dir, nm;
    try {
      var fp = $.fileName;
      if (fp && String(fp).length > 0) {
        var f = new File(fp);
        if (f && f.exists && f.parent && f.parent.exists) {
          if (isBin && /\.jsx$/i.test(String(f.name || f.fsName))) {
            return new File(f.parent.fsName + "/" + nameBin);
          }
          if (!isBin && /\.jsxbin$/i.test(String(f.name || f.fsName))) {
            return new File(f.parent.fsName + "/" + nameJsx);
          }
          return f;
        }
      }
    } catch (e0) {}
    folders = [];
    appPanels = getAeScriptUIPanelsInstallFolder();
    if (appPanels) folders.push(appPanels);
    usr = collectUserAeScriptUIPanelsFolders();
    for (i = 0; i < usr.length; i++) folders.push(usr[i]);
    var userRun = getUserScriptUIPanelsFolderForRunningAe();
    if (userRun && userRun.exists) {
      var seenU = false;
      for (i = 0; i < folders.length; i++) {
        if (folders[i].fsName === userRun.fsName) { seenU = true; break; }
      }
      if (!seenU) folders.push(userRun);
    }
    for (i = 0; i < folders.length; i++) {
      dir = folders[i];
      fbin = new File(dir.fsName + "/" + nameBin);
      fjsx = new File(dir.fsName + "/" + nameJsx);
      if (isBin) {
        for (j = 0; j < altBins.length; j++) {
          nm = new File(dir.fsName + "/" + altBins[j]);
          if (nm.exists) return nm;
        }
        if (fjsx.exists) return fbin;
      } else {
        if (fjsx.exists) return fjsx;
        for (j = 0; j < altBins.length; j++) {
          nm = new File(dir.fsName + "/" + altBins[j]);
          if (nm.exists) return new File(dir.fsName + "/" + nameJsx);
        }
      }
    }
    if (appPanels && appPanels.exists) {
      return new File(appPanels.fsName + "/" + (isBin ? nameBin : nameJsx));
    }
    if (userRun) {
      return new File(userRun.fsName + "/" + (isBin ? nameBin : nameJsx));
    }
    if (usr.length > 0) {
      return new File(usr[0].fsName + "/" + (isBin ? nameBin : nameJsx));
    }
    return null;
  }

  /** Ordered list of .jsxbin files to try writing (existing paths first, then app path, then user-writable path). */
  function buildJsxbinUpdateDestinationFiles() {
    var out = [];
    var seen = {};
    function pushDst(f) {
      if (!f) return;
      var k = f.fsName;
      if (seen[k]) return;
      seen[k] = true;
      out.push(f);
    }
    var primary = resolvePanelUpdateDestination(true);
    if (primary) pushDst(primary);
    var appP = getAeScriptUIPanelsInstallFolder();
    if (appP && appP.exists) {
      pushDst(new File(appP.fsName + "/" + UPDATE_PANEL_INSTALL_JSXBIN));
      pushDst(new File(appP.fsName + "/" + UPDATE_PANEL_ALT_JSXBIN));
    }
    var userP = getUserScriptUIPanelsFolderForRunningAe();
    if (userP) {
      if (!userP.exists) ensureFolderChain(userP);
      if (userP.exists) {
        pushDst(new File(userP.fsName + "/" + UPDATE_PANEL_INSTALL_JSXBIN));
      }
    }
    var usr = collectUserAeScriptUIPanelsFolders();
    var i;
    for (i = 0; i < usr.length; i++) {
      pushDst(new File(usr[i].fsName + "/" + UPDATE_PANEL_INSTALL_JSXBIN));
    }
    return out;
  }

  function tryInstallJsxbinToDestinations(tmpFile, setStatus) {
    var list = buildJsxbinUpdateDestinationFiles();
    var i, dst, bakPathBin, bakBin, okCopy;
    for (i = 0; i < list.length; i++) {
      dst = list[i];
      if (!dst || !dst.parent) continue;
      if (!dst.parent.exists) {
        if (!ensureFolderChain(dst.parent)) continue;
      }
      if (setStatus) setStatus("Installing update…");
      bakPathBin = dst.fsName + ".bak";
      bakBin = new File(bakPathBin);
      if (bakBin.exists) bakBin = new File(bakPathBin + "." + (new Date().getTime()));
      if (dst.exists) {
        copyFileBinary(dst, bakBin);
      }
      okCopy = copyFileBinary(tmpFile, dst) && isPlausibleJsxbinFile(dst);
      if (okCopy) {
        try {
          var par = dst.parent;
          if (par && par.exists) {
            var jsxSibling = new File(par.fsName + "/" + UPDATE_PANEL_INSTALL_JSX);
            if (jsxSibling.exists && jsxSibling.fsName !== dst.fsName) jsxSibling.remove();
            var k, alt, bn, alts = cultConnectorJsxbinBasenames();
            var dstBase = localFileName(dst);
            for (k = 0; k < alts.length; k++) {
              bn = alts[k];
              if (bn === dstBase) continue;
              alt = new File(par.fsName + "/" + bn);
              if (alt.exists && alt.fsName !== dst.fsName) alt.remove();
            }
          }
        } catch (eRmJsx) {}
        try { if (tmpFile.exists) tmpFile.remove(); } catch (eRm3) {}
        return { ok: true, installedPath: dst.fsName, backupPath: (bakBin && bakBin.exists) ? bakBin.fsName : "", mode: "overwrite" };
      }
    }
    return null;
  }

  function installUpdateFromRelease(info, setStatus) {
    if (!info || !info.downloadUrl) return { ok: false, reason: "Missing download URL." };
    var ver = String(info.version || "").replace(/^\s+|\s+$/g, "");
    var assetName = String(info.assetName || "");
    var isBin = isJsxbinAssetName(assetName);
    var ext = isBin ? ".jsxbin" : ".jsx";
    var tmpFile = new File(Folder.temp.fsName + "/CultConnector_update_" + (ver ? ver : ("" + new Date().getTime())) + ext);
    if (tmpFile.exists) { try { tmpFile.remove(); } catch (e0) {} }

    if (setStatus) setStatus("Downloading update…");
    var dl = curlDownloadPlain(info.downloadUrl, tmpFile, []);
    if (dl.http !== "200") {
      try { if (tmpFile.exists) tmpFile.remove(); } catch (eRm) {}
      return { ok: false, reason: "Download failed (HTTP " + dl.http + "). " + (dl.err || "") };
    }

    if (isBin) {
      if (!isPlausibleJsxbinFile(tmpFile)) {
        try { if (tmpFile.exists) tmpFile.remove(); } catch (eRm2) {}
        return { ok: false, reason: "Downloaded file did not look like a valid .jsxbin update." };
      }
      var autoBin = tryInstallJsxbinToDestinations(tmpFile, setStatus);
      if (autoBin) return autoBin;
      if (setStatus) setStatus("Saving update for manual install…");
      var outDirBin = new Folder(Folder.myDocuments.fsName + "/CultConnector_Update");
      if (!ensureFolder(outDirBin)) {
        return { ok: false, reason: "Could not create update folder in Documents." };
      }
      var outNameBin = "CultConnector_AE_Crowdin_" + (ver ? ver : "update") + ".jsxbin";
      var outFileBin = new File(outDirBin.fsName + "/" + outNameBin);
      if (outFileBin.exists) { try { outFileBin.remove(); } catch (_eb) {} }
      var okOutBin = copyFileBinary(tmpFile, outFileBin);
      try { if (tmpFile.exists) tmpFile.remove(); } catch (eRm4) {}
      if (!okOutBin) return { ok: false, reason: "Could not write update file to Documents." };
      return { ok: true, installedPath: outFileBin.fsName, backupPath: "", mode: "manual" };
    }

    var newText = readTextFile(tmpFile);
    if (!isValidUpdateScriptText(newText)) {
      try { if (tmpFile.exists) tmpFile.remove(); } catch (eRm2b) {}
      return { ok: false, reason: "Downloaded file did not look like a valid .jsx update." };
    }

    var dstJsx = resolvePanelUpdateDestination(false);
    var canAutoJsx = (dstJsx && dstJsx.parent && dstJsx.parent.exists);
    if (canAutoJsx) {
      if (setStatus) setStatus("Installing update…");
      var bakPath2 = dstJsx.fsName + ".bak";
      var bak2 = new File(bakPath2);
      if (bak2.exists) bak2 = new File(bakPath2 + "." + (new Date().getTime()));
      var oldText = dstJsx.exists ? readTextFile(dstJsx) : "";
      if (oldText && oldText.length > 0) {
        writeTextFile(bak2, oldText);
      }
      var okWrite = writeTextFile(dstJsx, newText);
      if (okWrite) {
        var verify = readTextFile(dstJsx);
        if (isValidUpdateScriptText(verify)) {
          try { if (tmpFile.exists) tmpFile.remove(); } catch (eRm3b) {}
          return { ok: true, installedPath: dstJsx.fsName, backupPath: (bak2 && bak2.exists && oldText && oldText.length > 0) ? bak2.fsName : "", mode: "overwrite" };
        }
      }
    }

    if (setStatus) setStatus("Saving update for manual install…");
    var outDir = new Folder(Folder.myDocuments.fsName + "/CultConnector_Update");
    if (!ensureFolder(outDir)) {
      return { ok: false, reason: "Could not create update folder in Documents." };
    }
    var outName = "CultConnector_AE_Crowdin_" + (ver ? ver : "update") + ".jsx";
    var outFile = new File(outDir.fsName + "/" + outName);
    var okOut = writeTextFile(outFile, newText);
    try { if (tmpFile.exists) tmpFile.remove(); } catch (eRm4b) {}
    if (!okOut) return { ok: false, reason: "Could not write update file to Documents." };
    return { ok: true, installedPath: outFile.fsName, backupPath: "", mode: "manual" };
  }

  /** True when the updater wrote under the per-user Adobe AE support folder (not the app bundle). */
  function installedPathUnderUserAeSupport(pathStr) {
    pathStr = String(pathStr || "");
    if (pathStr.indexOf("Adobe") === -1 || pathStr.indexOf("After Effects") === -1) return false;
    if (IS_WIN) return pathStr.indexOf("AppData") !== -1;
    return pathStr.indexOf("Application Support") !== -1;
  }

  function runUpdateCheck(setStatus) {
    var local = parseSemver(PLUGIN_VERSION);
    if (setStatus) setStatus("Checking for updates…");
    var info = getLatestReleaseInfo();
    if (!info.ok) {
      if (setStatus) setStatus("Update check failed.");
      alertIf("Could not check for updates.\n\nHTTP " + (info.http || "?") + "\n" + (info.err || ""));
      return false;
    }

    var remote = parseSemver(info.version);
    if (!remote.ok) {
      if (setStatus) setStatus("Update check failed.");
      alertIf("Latest release version is not a valid semver: " + (info.tag || info.version));
      return false;
    }

    if (compareSemver(remote, local) <= 0) {
      if (setStatus) setStatus("Up to date (v" + PLUGIN_VERSION + ").");
      alertIf("You are up to date.\n\nVersion " + PLUGIN_VERSION + ".");
      return true;
    }

    var msg = "Update available:\n\nCurrent: v" + PLUGIN_VERSION + "\nLatest:  v" + info.version + "\n\nInstall now? (After Effects restart required)";
    if (!tryConfirm(msg)) {
      if (setStatus) setStatus("Update cancelled.");
      return true;
    }

    var res = installUpdateFromRelease(info, setStatus);
    if (!res.ok) {
      if (setStatus) setStatus("Update failed.");
      alertIf("Update failed.\n\n" + (res.reason || "Unknown error."));
      return false;
    }

    if (res.mode === "overwrite") {
      if (setStatus) setStatus("Updated to v" + info.version + ". Restart After Effects.");
      var msgOk = "Update installed.\n\nInstalled to:\n" + res.installedPath + (res.backupPath ? ("\n\nBackup:\n" + res.backupPath) : "");
      msgOk += "\n\nQuit After Effects completely (File > Exit, or Cmd+Q on Mac), then start it again. Reopening only this panel can keep the old script in memory.";
      if (installedPathUnderUserAeSupport(res.installedPath)) {
        var appP = getAeScriptUIPanelsInstallFolder();
        if (appP && appP.exists) {
          var ip = String(res.installedPath || "");
          if (ip.indexOf(String(appP.fsName || "")) !== 0) {
            var sn = cultConnectorJsxbinBasenames();
            var j, pf, staleLines = [];
            for (j = 0; j < sn.length; j++) {
              pf = new File(appP.fsName + "/" + sn[j]);
              if (pf.exists) staleLines.push(pf.fsName);
            }
            if (staleLines.length > 0) {
              msgOk += "\n\nAfter Effects may still load an OLD panel from the application folder:\n" + staleLines.join("\n");
              msgOk += "\n\nMove or delete those .jsxbin files (admin password may be required), then restart After Effects. Otherwise the menu can keep using the old file.";
            }
          }
        }
      }
      alertIf(msgOk);
    } else {
      if (setStatus) setStatus("Update downloaded. Restart After Effects after replacing the script.");
      alertIf("Update downloaded.\n\nSaved to:\n" + res.installedPath + "\n\nReplace your installed ScriptUI panel script (.jsx or .jsxbin) with this file, then restart After Effects.");
    }
    return true;
  }

  function stylePanelLinkText(st) {
    try {
      var pen = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, [0.2, 0.55, 1, 1], 1);
      st.graphics.foregroundColor = pen;
    } catch (e) {}
  }

  function setNewVersionLinkVisible(lbl, visible, versionStr) {
    if (!lbl) return;
    try {
      lbl.visible = !!visible;
      if (visible) {
        lbl.text = versionStr ? ("New version available (v" + versionStr + ")") : "New version available";
      }
    } catch (e) {}
  }

  /** Background check for Composition footer link (no alert when up to date). */
  function refreshNewVersionLinkUi(lbl, setStatus) {
    if (!lbl) return;
    var info = getLatestReleaseInfo();
    if (!info.ok) {
      $.global.CultConnectorAE_pendingUpdateInfo = null;
      setNewVersionLinkVisible(lbl, false);
      return;
    }
    var remote = parseSemver(info.version);
    var local = parseSemver(PLUGIN_VERSION);
    if (!remote.ok) {
      $.global.CultConnectorAE_pendingUpdateInfo = null;
      setNewVersionLinkVisible(lbl, false);
      return;
    }
    if (compareSemver(remote, local) > 0) {
      $.global.CultConnectorAE_pendingUpdateInfo = info;
      setNewVersionLinkVisible(lbl, true, info.version);
    } else {
      $.global.CultConnectorAE_pendingUpdateInfo = null;
      setNewVersionLinkVisible(lbl, false);
    }
  }

  function promptInstallPendingUpdate(setStatus) {
    var info = $.global.CultConnectorAE_pendingUpdateInfo;
    if (!info || !info.ok) return false;
    var msg = "Install Cult Connector update?\n\nCurrent: v" + PLUGIN_VERSION + "\nLatest:  v" + info.version + "\n\nQuit and restart After Effects after installing.";
    if (!tryConfirm(msg)) {
      if (setStatus) setStatus("Update cancelled.");
      return false;
    }
    var res = installUpdateFromRelease(info, setStatus);
    if (!res.ok) {
      if (setStatus) setStatus("Update failed.");
      alertIf("Update failed.\n\n" + (res.reason || "Unknown error."));
      return false;
    }
    if (res.mode === "overwrite") {
      if (setStatus) setStatus("Updated to v" + info.version + ". Restart After Effects.");
      var msgOk = "Update installed.\n\nInstalled to:\n" + res.installedPath + (res.backupPath ? ("\n\nBackup:\n" + res.backupPath) : "");
      msgOk += "\n\nQuit After Effects completely, then start it again.";
      alertIf(msgOk);
    } else {
      if (setStatus) setStatus("Update downloaded. Replace the panel script and restart AE.");
      alertIf("Update downloaded.\n\nSaved to:\n" + res.installedPath + "\n\nReplace your installed ScriptUI panel (.jsx or .jsxbin), then restart After Effects.");
    }
    $.global.CultConnectorAE_pendingUpdateInfo = null;
    setNewVersionLinkVisible($.global.CultConnectorAE_lblNewVersion, false);
    return true;
  }

  // Build one multipart curl command string (for parallel uploads). Returns { cmd, httpPath [, headPath ] }.
  function curlPostMultipartBuild(url, fields, files, suffix){
    var TMP = Folder.temp;
    var RES = new File(TMP.fsName + "/ct_mp_" + suffix + ".txt");
    var HTTP= new File(TMP.fsName + "/ct_mp_" + suffix + ".http.txt");
    var HEAD= new File(TMP.fsName + "/ct_mp_" + suffix + ".head.txt");
    var ERR = new File(TMP.fsName + "/ct_mp_" + suffix + ".err.txt");
    var DEVICE_ID = getDeviceId();
    var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS --connect-timeout 15 --max-time 300 -X POST ' +
              '-H "x-license-key: ' + getLicenseHeaderForRequest() + '" -H "x-device-id: ' + DEVICE_ID + '" -H "x-device-name: ' + DEVICE_ID + '" ';
    var i;
    for (i=0;i<fields.length;i++) cmd += '-F "' + fields[i].name + '=' + jsonEscape(fields[i].value) + '" ';
    for (i=0;i<files.length;i++){
      var part = files[i].name + '=@' + pathForCurl(files[i].path);
      if (files[i].filename) part += ';filename=' + files[i].filename;
      part += ';type=' + (files[i].mime||'application/octet-stream');
      cmd += '-F "' + part + '" ';
    }
    cmd += '-o "' + pathForCurl(RES.fsName) + '" "' + url + '" ';
    if (IS_WIN)
      cmd += '-D "' + pathForCurl(HEAD.fsName) + '" 2> "' + pathForCurl(ERR.fsName) + '"';
    else
      cmd += '-w "' + CURL_HTTP_CODE + '" > "' + HTTP.fsName + '" 2> "' + ERR.fsName + '"';
    return { cmd: cmd, httpPath: HTTP.fsName, headPath: IS_WIN ? HEAD.fsName : null };
  }

  // Build curl command for strings upload (caller appends -o/-D).
  function buildStringsCurlCmd(path, fields) {
    var DEVICE_ID = getDeviceId();
    var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS --connect-timeout 10 --max-time 180 -X POST ' +
      '-H "x-license-key: ' + getLicenseHeaderForRequest() + '" -H "x-device-id: ' + DEVICE_ID + '" -H "x-device-name: ' + DEVICE_ID + '" ';
    for (var i = 0; i < fields.length; i++)
      cmd += '-F "' + fields[i].name + '=' + jsonEscape(fields[i].value) + '" ';
    cmd += '-F "strings=@' + pathForCurl(path) + '" ';
    return cmd;
  }

  // Run multiple upload commands in parallel (Mac/Linux: shell background). Windows: sequential direct curl (no cmd.exe / .bat — matches Cult Translator).
  // If options.keepBodies is true, returns { codes: string[], bodies: string[] }; otherwise returns codes only (for backward compat).
  function runParallelScanUploads(commands, options){
    var keepBodies = options && options.keepBodies;
    if (!commands.length) return keepBodies ? { codes: [], bodies: [] } : [];
    if (IS_WIN) {
      var wi;
      for (wi = 0; wi < commands.length; wi++) {
        run(commands[wi].cmd);
      }
      var outWin = [];
      var bodiesWin = [];
      for (wi = 0; wi < commands.length; wi++) {
        var httpFW = new File(commands[wi].httpPath);
        var headFW = commands[wi].headPath ? new File(commands[wi].headPath) : null;
        outWin.push(readHttpCodeFromCurlResult(httpFW, headFW));
        if (keepBodies) {
          var resFW = new File(commands[wi].httpPath.replace(/\.http\.txt$/, ".txt"));
          bodiesWin.push(resFW.exists ? readTextFile(resFW) : "");
          try { if (resFW.exists) resFW.remove(); } catch(e2w){}
        } else {
          try { var resFW2 = new File(commands[wi].httpPath.replace(/\.http\.txt$/, ".txt")); if (resFW2.exists) resFW2.remove(); } catch(e2w2){}
        }
        try { if (httpFW.exists) httpFW.remove(); } catch(e){}
        try { if (headFW && headFW.exists) headFW.remove(); } catch(ehw){}
        try { var errFW = new File(commands[wi].httpPath.replace(/\.http\.txt$/, ".err.txt")); if (errFW.exists) errFW.remove(); } catch(e3w){}
      }
      return keepBodies ? { codes: outWin, bodies: bodiesWin } : outWin;
    }
    if (commands.length === 1) {
      run(commands[0].cmd);
      var httpF = new File(commands[0].httpPath);
      var code = normalizeHttpCode(readTextFile(httpF));
      var body = "";
      if (keepBodies) {
        var resF = new File(commands[0].httpPath.replace(/\.http\.txt$/, ".txt"));
        if (resF.exists) body = readTextFile(resF);
        try { if (resF.exists) resF.remove(); } catch(e2){}
      } else {
        try { var resF = new File(commands[0].httpPath.replace(/\.http\.txt$/, ".txt")); if (resF.exists) resF.remove(); } catch(e2){}
      }
      try { if (httpF.exists) httpF.remove(); } catch(e){}
      try { var errF = new File(commands[0].httpPath.replace(/\.http\.txt$/, ".err.txt")); if (errF.exists) errF.remove(); } catch(e3){}
      return keepBodies ? { codes: [code], bodies: [body] } : [code];
    }
    var par = "";
    for (var p = 0; p < commands.length; p++) {
      if (p > 0) par += " ";
      par += "(" + commands[p].cmd + ") &";
    }
    par += " wait";
    run(par);
    var out = [];
    var bodies = [];
    for (var o = 0; o < commands.length; o++) {
      var hf = new File(commands[o].httpPath);
      var code = normalizeHttpCode(readTextFile(hf));
      out.push(code);
      if (keepBodies) {
        var resF = new File(commands[o].httpPath.replace(/\.http\.txt$/, ".txt"));
        bodies.push(resF.exists ? readTextFile(resF) : "");
        try { if (resF.exists) resF.remove(); } catch(e2){}
      } else {
        try { var resF = new File(commands[o].httpPath.replace(/\.http\.txt$/, ".txt")); if (resF.exists) resF.remove(); } catch(e2){}
      }
      try { if (hf.exists) hf.remove(); } catch(e){}
      try { var errF = new File(commands[o].httpPath.replace(/\.http\.txt$/, ".err.txt")); if (errF.exists) errF.remove(); } catch(e3){}
    }
    return keepBodies ? { codes: out, bodies: bodies } : out;
  }

  // Run one upload command in background (for pipelining: don't wait). Mac: ( cmd ) & ; Windows: synchronous curl only (no shell flash; overlaps export less than async bat).
  function runUploadInBackground(cmdObj, batFilesToRemove){
    var cmd = cmdObj.cmd;
    if (IS_WIN) {
      run(cmd);
    } else {
      run('( ' + cmd + ' ) &');
    }
  }

  // Wait for all background uploads to finish (poll each path until non-empty). Paths are .http.txt on Mac; on Windows scan uploads use .head.txt (curl -D).
  // If options.keepBodies is true, returns { codes: string[], bodies: string[] }; otherwise returns codes only.
  function waitForBackgroundUploads(httpPaths, timeoutMs, options){
    var keepBodies = options && options.keepBodies;
    if (!httpPaths.length) return keepBodies ? { codes: [], bodies: [] } : [];
    var deadline = (new Date()).getTime() + (timeoutMs || 120000);
    while ((new Date()).getTime() < deadline) {
      var allDone = true;
      for (var i = 0; i < httpPaths.length; i++) {
        var f = new File(httpPaths[i]);
        if (!f.exists || f.length === 0) { allDone = false; break; }
      }
      if (allDone) break;
      $.sleep(100);
    }
    var out = [];
    var bodies = [];
    for (var i = 0; i < httpPaths.length; i++) {
      var hf = new File(httpPaths[i]);
      var headerDump = /\.head\.txt$/i.test(httpPaths[i]);
      out.push(readHttpCodeFromCurlResult(headerDump ? null : hf, headerDump ? hf : null));
      if (keepBodies) {
        var resF = new File(httpPaths[i].replace(/\.http\.txt$/, ".txt"));
        bodies.push(resF.exists ? readTextFile(resF) : "");
        try { if (resF.exists) resF.remove(); } catch(e2){}
      } else {
        try { var resF = new File(httpPaths[i].replace(/\.http\.txt$/, ".txt")); if (resF.exists) resF.remove(); } catch(e2){}
      }
      try { if (hf.exists) hf.remove(); } catch(e){}
      try { var errF = new File(httpPaths[i].replace(/\.http\.txt$/, ".err.txt")); if (errF.exists) errF.remove(); } catch(e3){}
    }
    return keepBodies ? { codes: out, bodies: bodies } : out;
  }

  function clearOauthPending() {
    $.global.CultConnectorAE_oauthPending = null;
  }

  function cancelOauthPoll() {
    if ($.global.CultConnectorAE_oauthCtx) {
      $.global.CultConnectorAE_oauthCtx.active = false;
      $.global.CultConnectorAE_oauthCtx = null;
    }
  }

  var OAUTH_POLL_MS = 1000;
  var OAUTH_MAX_WAIT_MS = 45000;

  function phraseOauthResponseIsJson(body) {
    var b = String(body || "").replace(/^\s+/, "");
    return b.length > 0 && b.charAt(0) === "{";
  }

  function oauthPollBodyPhraseConnected(body) {
    return /"connected"\s*:\s*true/i.test(String(body || ""));
  }

  function isPhraseAlreadyConnected() {
    if (TMS_PROVIDER !== "phrase" || !EP_PHRASE_OAUTH_CONNECTED) return false;
    var c = curlGet(EP_PHRASE_OAUTH_CONNECTED);
    return c.http === "200" && phraseOauthResponseIsJson(c.body) && oauthPollBodyPhraseConnected(c.body);
  }

  /** One poll: done, error, or keep waiting. Phrase uses /oauth/status every tick (fast); /connected as backup only. */
  function oauthPollOnce(ctx) {
    var pollN = ctx.pollCount || 0;
    if (TMS_PROVIDER === "phrase" && EP_PHRASE_OAUTH_CONNECTED && pollN > 0 && (pollN % 5) === 4) {
      var conn = curlGet(EP_PHRASE_OAUTH_CONNECTED);
      if (conn.http === "200" && phraseOauthResponseIsJson(conn.body) && oauthPollBodyPhraseConnected(conn.body)) {
        return { ok: true };
      }
    }
    var s = curlGet(EP_OAUTH_STATUS + "?state=" + encodeURIComponent(ctx.state));
    if (!s.body) return null;
    if (String(s.body).toLowerCase().indexOf('"done":true') === -1) return null;
    var err = extractJsonField(s.body, "error");
    if (err) return { ok: false, err: err };
    return { ok: true };
  }

  function oauthFinishPoll(ctx, result) {
    ctx.active = false;
    $.global.CultConnectorAE_oauthCtx = null;
    if (result.ok) {
      STATE.connected = true;
      ctx.setStatus("Connected.");
      if (ctx.onDone) ctx.onDone(true);
      return;
    }
    if (result.err) {
      ctx.setStatus("Login failed.");
      alertIf(
        tmsDisplayName() + " login failed.\n" +
        ("Reason: " + result.err + "\n\n") +
        "If the browser showed Connected but you still see this, your account may not be on the workspace allowlist.\n" +
        "Contact your administrator, then try Connect again."
      );
      if (ctx.onDone) ctx.onDone(false);
      return;
    }
    ctx.setStatus("Login timed out.");
    var timeoutMsg =
      tmsDisplayName() + " login timed out.\n" +
      "If the browser shows Connected, click Connect again.\n" +
      "If you closed the browser or did not finish logging in, click Connect to restart login.";
    if (TMS_PROVIDER === "phrase") {
      timeoutMsg +=
        "\n\nUse the tab Cult Connector opened and click Allow on the authorization page " +
        "(opening \"Phrase TMS\" on the Platform dashboard only shows the project list).";
    }
    alertIf(timeoutMsg);
    if (ctx.onDone) ctx.onDone(false);
  }

  function oauthScheduleNextPoll(ctx) {
    if (!ctx || !ctx.active || ctx.pollScheduled) return;
    ctx.pollScheduled = true;
    try {
      app.scheduleTask("$.global.CultConnectorAE_oauthPollTick()", ctx.pollMs, false);
    } catch (eSch) {
      ctx.pollScheduled = false;
    }
  }

  function oauthPollTick() {
    var ctx = $.global.CultConnectorAE_oauthCtx;
    if (!ctx || !ctx.active) return;
    ctx.pollScheduled = false;
    try {
      ctx.pollCount = (ctx.pollCount || 0) + 1;
      var hit = oauthPollOnce(ctx);
      if (hit) {
        oauthFinishPoll(ctx, hit);
        return;
      }
      var elapsedMs = (new Date()).getTime() - ctx.startMs;
      if (elapsedMs >= ctx.timeout) {
        var last = oauthPollOnce(ctx);
        if (last && last.ok) {
          oauthFinishPoll(ctx, last);
          return;
        }
        oauthFinishPoll(ctx, { ok: false });
        return;
      }
      oauthScheduleNextPoll(ctx);
    } catch (ePoll) {
      ctx.active = false;
      $.global.CultConnectorAE_oauthCtx = null;
      if (ctx.onDone) ctx.onDone(false);
    }
  }
  $.global.CultConnectorAE_oauthPollTick = oauthPollTick;

  function oauthPollKick(ctx) {
    var hit = oauthPollOnce(ctx);
    if (hit) {
      oauthFinishPoll(ctx, hit);
      return;
    }
    oauthScheduleNextPoll(ctx);
  }

  // One browser tab; non-blocking poll (detects Allow within ~1–2s, same as pre-1.4.7 Phrase flow).
  function oauthConnect(setStatus, mode, onDone) {
    if (!ensureCurl()) {
      if (onDone) onDone(false);
      return false;
    }
    cancelOauthPoll();
    clearOauthPending();

    var startUrl = EP_OAUTH_START;
    if (TMS_PROVIDER === "crowdin_enterprise") startUrl = EP_OAUTH_START_ENTERPRISE;
    else if (TMS_PROVIDER === "crowdin_team") startUrl = EP_OAUTH_START_TEAM;
    else if (TMS_PROVIDER === "phrase") startUrl = EP_OAUTH_START;

    setStatus("Starting " + tmsDisplayName() + " login…");
    var r = curlGet(startUrl);

    var state = extractJsonField(r.body, "state");
    var url   = extractJsonField(r.body, "url");

    if (!state || !url) {
      setStatus("Login failed.");
      alertIf("OAuth start failed.\nHTTP " + (r.http || "(none)") + "\n\n" + (r.body || ""));
      if (onDone) onDone(false);
      return false;
    }

    openUrl(url);
    setStatus("Waiting for authorization…");

    $.global.CultConnectorAE_oauthCtx = {
      active: true,
      state: state,
      setStatus: setStatus,
      onDone: onDone || null,
      startMs: (new Date()).getTime(),
      timeout: OAUTH_MAX_WAIT_MS,
      pollMs: OAUTH_POLL_MS,
      pollCount: 0,
      pollScheduled: false
    };
    oauthPollKick($.global.CultConnectorAE_oauthCtx);
    return true;
  }

  function loadProjects(setStatus){
    setStatus("Loading projects…");
    var r = curlGet(EP_PROJECTS);
    if (r.http !== "200") {
      // Friendlier messaging when the connector is not connected / account not allowed.
      var bodyStr = String(r.body || "");
      if (r.http === "428" && bodyStr.indexOf("enterprise_org_required") !== -1) {
        setStatus("Enterprise org required.");
        alertIf(
          "Crowdin Enterprise organization could not be detected for this login.\n\n" +
          "Try: Disconnect, then connect again with Crowdin Enterprise (not Crowdin Teams).\n\n" +
          "If it still fails, ask your admin to set the org slug on the server " +
          "(POST /integrations/crowdin/set-org with your organization subdomain)."
        );
      } else if (r.http === "401" && bodyStr.indexOf('"not_connected"') !== -1) {
        setStatus(tmsDisplayName() + " not connected.");
        alertIf(
          tmsDisplayName() + " is not connected for this After Effects machine.\n" +
          "Finish logging in with an allowed account in the browser, then click Connect again.\n\n" +
          "If you still see this message, your account may not be authorized for this connector.\n" +
          "Please contact your administrator or the Cult support team."
        );
      } else {
        setStatus("Projects failed.");
        alertIf("Projects failed.\nHTTP " + r.http + "\n\n" + (r.body||""));
      }
      return [];
    }
    if (isGzipCompressedBody(r.body)) {
      setStatus("Projects response garbled (gzip).");
      alertIf("Could not read the project list (compressed response).\n\nUpdate Cult Connector to v1.3.4+ and restart After Effects.");
      return [];
    }
    var ps = parseProjects(r.body);
    if ((!ps || !ps.length) && r.body && (r.body.indexOf('"name"') >= 0) && (r.body.indexOf('"id"') >= 0 || r.body.indexOf('"uid"') >= 0)) {
      setStatus("Projects parse failed.");
      alertIf("Projects were returned but could not be read by the panel.\n\nPlease update Cult Connector to the latest version and try again.");
      return [];
    }
    STATE.projects = ps;
    try {
      var parsedRoot = JSON.parse(String(r.body || "").replace(/^\uFEFF/, ""));
      if (parsedRoot && parsedRoot.organization) STATE.crowdinOrganization = String(parsedRoot.organization);
    } catch (eOrg) {}
    setStatus("Projects loaded.");
    return ps;
  }

  function selectProject(projectId, projectName, setStatus){
    STATE.projectId = String(projectId);
    STATE.projectName = projectName || ("Project " + projectId);
    var payload = '{"projectId":"' + jsonEscape(STATE.projectId) + '"}';
    curlPostJson(EP_SELECT_PROJECT, payload);
    setStatus("Selected: " + STATE.projectName);
  }

  function loadLanguages(setStatus){
    if (!STATE.projectId) { setStatus("Select a project first."); return []; }
    setStatus("Loading languages…");
    var r = curlGet(EP_LANGS + "?projectId=" + encodeURIComponent(STATE.projectId));
    if (r.http !== "200") {
      setStatus("Languages failed.");
      alertIf("Languages failed.\nHTTP " + r.http + "\n\n" + (r.body||""));
      return [];
    }
    var langs = parseLanguages(r.body);
    langs.sort(function(a,b){
      var A=(a.name||a.id||"").toLowerCase(), B=(b.name||b.id||"").toLowerCase();
      if (A<B) return -1; if (A>B) return 1; return 0;
    });
    STATE.languages = langs;
    setStatus("Languages loaded.");
    return langs;
  }

  // AE collect selected text layers
  var TEXT_PROPS_MATCHNAME="ADBE Text Properties";
  var TEXT_DOC_MATCHNAME="ADBE Text Document";

  function getSourceTextProp(layer){
    if (!layer || layer.matchName !== "ADBE Text Layer") return null;
    var tp = layer.property(TEXT_PROPS_MATCHNAME);
    if (!tp) return null;
    return tp.property(TEXT_DOC_MATCHNAME) || null;
  }

  function makeStringKey(comp, layer){
    return "comp_" + comp.id + "__layer_" + layer.index;
  }

  /** Snapshot Marker: preferred screenshot time. Returns time (in layer comp) if layer has a marker with SNAPSHOT_MARKER_COMMENT, else null. Uses layer.marker or property("Marker") per AE scripting docs. */
  function getSnapshotMarkerTime(layer) {
    try {
      var prevActive = null;
      try {
        if (layer && layer.comp && app.project && app.project.activeItem !== layer.comp) {
          prevActive = app.project.activeItem;
          app.project.activeItem = layer.comp;
        }
      } catch (eSwitch) {}
      try {
        var mp = (typeof layer.marker !== "undefined" && layer.marker != null) ? layer.marker : (layer.property("Marker") || layer.property("ADBE Marker"));
        if (!mp || typeof mp.numKeys !== "number") return null;
        for (var k = 1; k <= mp.numKeys; k++) {
          var kv = mp.keyValue(k);
          if (!kv) continue;
          var cmt = (typeof kv.comment !== "undefined") ? String(kv.comment).replace(/^\s+|\s+$/g, "") : "";
          if (isSnapshotMarkerComment(cmt)) return mp.keyTime(k);
        }
      } finally {
        if (prevActive && app.project) { try { app.project.activeItem = prevActive; } catch (eRestore) {} }
      }
    } catch (e) {}
    return null;
  }

  /** Add or update Snapshot Marker on the given layer at the given time (in the layer's comp). Removes any existing Snapshot Marker first so there is at most one. Uses layer.marker or property("Marker"). Does not create any layers or null objects. */
  function setSnapshotMarkerAtTime(layer, time) {
    try {
      var mp = (typeof layer.marker !== "undefined" && layer.marker != null) ? layer.marker : (layer.property("Marker") || layer.property("ADBE Marker"));
      if (!mp || typeof mp.setValueAtTime !== "function") return false;
      var n = (mp.numKeys != null) ? mp.numKeys : 0;
      for (var k = n; k >= 1; k--) {
        try {
          var kv = mp.keyValue(k);
          if (!kv) continue;
          var cmt = (typeof kv.comment !== "undefined") ? String(kv.comment) : "";
          if (isSnapshotMarkerComment(cmt)) mp.removeKey(k);
        } catch (eKey) {}
      }
      var mv = new MarkerValue(getSnapshotMarkerComment());
      if (!mv) return false;
      mp.setValueAtTime(time, mv);
      return true;
    } catch (e) { return false; }
  }

  /** True if the layer has at least one frame where it is visible in the comp. For track-matte layers, "comp" means the matte bounds. */
  function hasVisibleFrameInComp(layer, comp) {
    try {
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < 0.01) return false;
      var step = comp.frameDuration || (1/24);
      if (!isFinite(step) || step <= 0) step = 1/24;
      var samples = Math.min(15, Math.max(1, Math.floor((b - a) / step)));
      var timesToTry = [];
      for (var i = 0; i <= samples; i++) {
        timesToTry.push(a + (b - a) * (i / Math.max(1, samples)));
      }
      // For typewriter (animator/range selector), also sample the end of the layer so we hit the fully-revealed portion
      if (b - a > 0.5) {
        for (var r = 0.8; r <= 1; r += 0.05) timesToTry.push(a + (b - a) * r);
      } else if (b - a > 0.05) {
        timesToTry.push(a + (b - a) * 0.9);
      }
      for (var idx = 0; idx < timesToTry.length; idx++) {
        var t = timesToTry[idx];
        try { if (!layer.activeAtTime(t)) continue; } catch (e) { continue; }
        if (!layerEligible(layer, t)) continue;
        var info = bboxForLayer(layer, comp, t);
        if (!info || !info.bbox) continue;
        var ref = getEffectiveBoundsForLayerAtTime(layer, comp, t);
        if (!bboxIntersectsRect(info.bbox, ref)) continue;
        if (intersectionRatioRects(info.bbox, ref) < MIN_IN_RATIO) continue;
        return true;
      }
    } catch (e) {}
    return false;
  }

  /** Get all text layers from comp c and nested precomps. Only includes layers that are visible: in their own comp (hasVisibleFrameInComp) and, if in a precomp, visible in rootComp (hasVisibleFrameInMainComp). rootComp = main comp we're exporting. */
  function getTextLayersFromComp(c, visited, rootComp, debugCollect) {
    if (!c || !(c instanceof CompItem)) return [];
    if (visited[c.id]) return [];
    visited[c.id] = true;
    var out = [];
    try {
      var layers = c.layers;
      var cName = (c.name != null) ? String(c.name) : "";
      for (var i = 1; i <= layers.length; i++) {
        var layer = layers[i];
        if (!layer) continue;
        if (layer.matchName === "ADBE Text Layer" && layer.enabled) {
          var visibleInOwnComp = hasVisibleFrameInComp(layer, c);
          if (debugCollect) debugCollect.push("  [" + cName + "] '" + (layer.name || "") + "': visibleInOwnComp=" + visibleInOwnComp);
          if (c === rootComp) {
            var inP = Number(layer.inPoint || 0);
            var outP = Number(layer.outPoint || 0);
            var hasDuration = (outP - inP) >= 0.01;
            if (visibleInOwnComp || hasDuration) {
              out[out.length] = { layer: layer, comp: c };
              if (debugCollect) debugCollect.push("    -> included (root)");
            } else if (debugCollect) debugCollect.push("    -> skipped (root, not visible)");
          } else {
            var inPn = Number(layer.inPoint || 0);
            var outPn = Number(layer.outPoint || 0);
            var hasDurN = (outPn - inPn) >= 0.01;
            var visibleInMain = rootComp ? hasVisibleFrameInMainComp(layer, c, rootComp) : false;
            if (debugCollect) debugCollect.push("    visibleInMainComp=" + visibleInMain);
            if ((visibleInOwnComp || hasDurN) && (!rootComp || visibleInMain || hasDurN)) {
              out[out.length] = { layer: layer, comp: c };
              if (debugCollect) debugCollect.push("    -> included (nested)");
            } else if (debugCollect) debugCollect.push("    -> skipped (nested)");
          }
        }
        if (layer.enabled && layer.source && (layer.source instanceof CompItem)) {
          var nested = getTextLayersFromComp(layer.source, visited, rootComp, debugCollect);
          for (var j = 0; j < nested.length; j++) out[out.length] = nested[j];
        }
      }
    } catch (e) { if (debugCollect) debugCollect.push("  getTextLayersFromComp error: " + e.toString()); }
    return out;
  }

  /** All enabled text layers in comp + nested precomps (no visibility filter — rescue pass for precomp text). */
  function getTextLayersFromCompAllEnabled(c, visited) {
    if (!c || !(c instanceof CompItem)) return [];
    if (visited[c.id]) return [];
    visited[c.id] = true;
    var out = [];
    try {
      var layers = c.layers;
      for (var i = 1; i <= layers.length; i++) {
        var layer = layers[i];
        if (!layer || !layer.enabled) continue;
        if (layer.matchName === "ADBE Text Layer") {
          out[out.length] = { layer: layer, comp: c };
        }
        if (layer.source && (layer.source instanceof CompItem)) {
          var nested = getTextLayersFromCompAllEnabled(layer.source, visited);
          for (var j = 0; j < nested.length; j++) out[out.length] = nested[j];
        }
      }
    } catch (e) {}
    return out;
  }

  /** Full comp: all text layers in comp and nested precomps (enabled only, visible in comp / in main). */
  function getTextLayersIncludingPrecomps(comp, debugCollect) {
    return getTextLayersFromComp(comp, {}, comp, debugCollect || null);
  }

  /** Always full comp: visible layers first, then any missing enabled text from nested precomps. */
  function getTextLayersForExport(comp) {
    var debugCollect = (typeof DEBUG_TYPEWRITER_LOG !== "undefined" && DEBUG_TYPEWRITER_LOG) ? [] : null;
    var out = getTextLayersFromComp(comp, {}, comp, debugCollect);
    var seen = {};
    var ki, kid;
    for (ki = 0; ki < out.length; ki++) {
      kid = makeStringKey(out[ki].comp, out[ki].layer);
      seen[kid] = true;
    }
    var rescue = getTextLayersFromCompAllEnabled(comp, {});
    for (ki = 0; ki < rescue.length; ki++) {
      kid = makeStringKey(rescue[ki].comp, rescue[ki].layer);
      if (!seen[kid]) {
        out[out.length] = rescue[ki];
        seen[kid] = true;
        if (debugCollect) debugCollect.push("  [rescue] included: " + (rescue[ki].layer.name || kid));
      }
    }
    if (debugCollect && debugCollect.length) {
      try {
        var f = new File(Folder.myDocuments.fsName + "/Crowdin_layers_debug.txt");
        if (f.open("w")) {
          f.write("=== getTextLayersForExport (full comp: " + (comp.name || "") + ") ===\r\n");
          for (var i = 0; i < debugCollect.length; i++) f.write(debugCollect[i] + "\r\n");
          f.write("Total included: " + out.length + "\r\n");
          f.close();
        }
      } catch (e) {}
    }
    return out;
  }

  function getSelectedTextLayers(comp){
    var sel = comp.selectedLayers || [];
    var out = [];
    for (var i=0;i<sel.length;i++){
      if (sel[i] && sel[i].matchName === "ADBE Text Layer") out[out.length] = sel[i];
    }
    return out;
  }

  function collectText(setStatus, comp){
    comp = (comp != null && comp instanceof CompItem) ? comp : null;
    if (!comp) return null;

    var layerComps = getTextLayersForExport(comp);
    if (!layerComps.length) {
      setStatus("No text layers in comp.");
      alertIf("No text layers in this composition. Add text layers to send to Crowdin.");
      return null;
    }

    var items = [];
    for (var i=0;i<layerComps.length;i++){
      var L = layerComps[i].layer;
      var C = layerComps[i].comp;
      var sp = getSourceTextProp(L);
      if (!sp) continue;
      var txt = normalizeTextForTmsExport(getCompletedTextForLayer(L, C));
      items[items.length] = { id: makeStringKey(C, L), text: txt ? txt : " " };
    }

    STATE.compId = "" + comp.id;
    STATE.fileKey = safeFileKeyForComp(comp);
    // Store comp name in first item so upload always has it (only when we have at least one item)
    if (items.length > 0) {
      try {
        var compNameRaw = (comp && comp.name != null) ? String(comp.name) : "";
        var compName = compNameRaw.replace(/^\s+|\s+$/g, ""); // trim without .trim() for ExtendScript
        if (compName.length > 0) {
          // Preserve spaces and all Unicode letters; only replace path-breaking characters.
          var badChars = "\\/:*?\"<>|\t\n\r";
          var s = "";
          var i, ch, prevUnderscore = false;
          for (i = 0; i < compName.length; i++) {
            ch = compName.charAt(i);
            if (badChars.indexOf(ch) >= 0) {
              if (!prevUnderscore) { s += "_"; prevUnderscore = true; }
            } else {
              s += ch;
              prevUnderscore = false;
            }
          }
          s = s.replace(/^_+/, "").replace(/_+$/, "");
          if (s.length > 0 && s.length <= 200) items[0].__compName = s;
        }
      } catch (e) { /* skip __compName on any error so collection still works */ }
    }

    setStatus("Collected " + items.length + " strings.");
    return items;
  }

  function uploadStrings(items, setStatus, targetLang){
    if (!items || !items.length) return false;
    if (!STATE.projectId) { alertIf("Select a project first."); return false; }

    // Ensure we have comp id from the items we're uploading (e.g. "comp_21__layer_1" -> 21)
    if (!STATE.compId && items[0] && items[0].id) {
      var match = String(items[0].id).match(/^comp_(\d+)__/);
      if (match) STATE.compId = match[1];
    }

    // Prefer comp name embedded at collect time (most reliable)
    if (items[0] && items[0].__compName && String(items[0].__compName).length > 0) {
      STATE.fileKey = String(items[0].__compName);
    }
    // Else discover composition name from comp id (avoid getActiveComp so multi-comp export does not alert).
    if (!STATE.fileKey || STATE.fileKey === "comp_" + (STATE.compId || "")) {
      var foundComp = findCompById(STATE.compId);
      if (foundComp) STATE.fileKey = safeFileKeyForComp(foundComp);
    }
    if (!STATE.fileKey) STATE.fileKey = "comp_" + (STATE.compId || "");

    // On Windows use an ASCII-safe key only for the temporary JSON filename so the
    // filesystem path is safe, but always send the original STATE.fileKey to the
    // server so /ae/strings, /ae/pull and /ae/scan-frame all see the same Unicode key.
    var internalFileKeyForTemp = IS_WIN ? safeScreenshotBase(STATE.fileKey) : STATE.fileKey;

    setStatus("Uploading strings…");

    var TMP = Folder.temp;
    // Use native path for File so the file is created where the OS expects (fixes Windows "file not found").
    var exportFileName = internalFileKeyForTemp + ".json";
    var fStrings = new File(TMP.fsName + "/" + exportFileName);

    // Strip internal __compName before sending; send fileKey inside JSON so server has the composition name.
    var itemsToSend = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var copy = { id: it.id, text: it.text };
      itemsToSend.push(copy);
    }
    // Keep the logical fileKey as the human-friendly (possibly Unicode) comp name so it
    // stays consistent with the fileKey used for screenshot uploads and WebXML lookup.
    var payloadObj = { fileKey: STATE.fileKey, items: itemsToSend };
    var payload = jsonStringifyMini(payloadObj);
    if (!writeTextFile(fStrings, payload)) {
      setStatus("Failed writing temp strings file.");
      return false;
    }
    if (!fStrings.exists) {
      setStatus("Temp file not found.");
      alertIf("Temp file was not created.\nPath: " + (fStrings.fsName || ""));
      return false;
    }

    if (IS_WIN) {
      try {
        var dbg = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt");
        dbg.encoding = "UTF-8";
        dbg.open("a");
        dbg.write("\r\n--- uploadStrings " + (new Date().getTime()) + " ---\r\n");
        dbg.write("TMP.fsName: " + TMP.fsName + "\r\n");
        dbg.write("fStrings.fsName: " + fStrings.fsName + "\r\n");
        dbg.write("pathForCurl(fStrings.fsName): " + pathForCurl(fStrings.fsName) + "\r\n");
        dbg.write("fStrings.exists: " + fStrings.exists + "\r\n");
        dbg.write("exportFileName: " + exportFileName + "\r\n");
        dbg.close();
      } catch (e) {}
    }

    var resp = curlPostMultipart(
      EP_STRINGS,
      [
        { name:"projectId", value: STATE.projectId },
        { name:"compId", value: STATE.compId },
        { name:"fileKey", value: STATE.fileKey },
        // Pass segmentation preference explicitly (1/0) for compatibility with existing API.
        { name:"useSegmentation", value: STATE.useSegmentation ? "1" : "0" }
      ].concat((targetLang && targetLang !== "all") ? [{ name:"targetLanguage", value: targetLang }] : []),
      [
        { name:"strings", path: fStrings.fsName, mime:"application/json" }
      ]
    );

    if (IS_WIN) {
      try { var _u = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _u.encoding = "UTF-8"; _u.open("a"); _u.write("[uploadStrings] stepA after curlPostMultipart resp.http=" + (resp ? resp.http : "null") + "\r\n"); _u.close(); } catch (_eu) {}
    }
    if (!IS_WIN) { try{ fStrings.remove(); }catch(e){} }
    if (IS_WIN) {
      try { var _u2 = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _u2.encoding = "UTF-8"; _u2.open("a"); _u2.write("[uploadStrings] stepB after fStrings skip/remove\r\n"); _u2.close(); } catch (_eu2) {}
    }

    try {
      if (!resp || resp.http !== "200") {
        setStatus("Upload failed.");
        alertIf("Upload strings failed.\nHTTP " + (resp && resp.http != null ? resp.http : "no response") + "\n\n" + (resp && resp.body ? resp.body : ""));
        return false;
      }

      var statusMsg = "Uploaded!";
      try {
        var r = JSON.parse(resp.body || "{}");
        if (r.fileName) {
          var displayName = (r.displayFileName != null && String(r.displayFileName).length > 0) ? String(r.displayFileName) : String(r.fileName).replace(/\.(json|xml)$/i, "");
          statusMsg = "Uploaded as " + displayName;
        }
        if (r._receivedFilename != null) statusMsg += " (received: " + String(r._receivedFilename).replace(/\.(json|xml)$/i, "") + ")";
      } catch(e){}
      if (IS_WIN) {
        try { var _u3 = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _u3.encoding = "UTF-8"; _u3.open("a"); _u3.write("[uploadStrings] stepC before setStatus/return true\r\n"); _u3.close(); } catch (_eu3) {}
      }
      // Windows: skip setStatus here to avoid ScriptUI crash after system.callSystem (see curlPostMultipart comment).
      if (!IS_WIN) {
        setStatus(statusMsg);
      }
      return true;
    } catch (e) {
      setStatus("Upload failed.");
      alertIf("Upload error: " + (e && e.message ? e.message : String(e)));
      return false;
    }
  }

  /** Language upload targets for ae/strings (same rules as Send Selected Compositions). */
  function getUploadTargetsFromPanel() {
    try {
      if (cbLangAll && cbLangAll.value === true) return ["all"];
    } catch (eLangAll) {}
    var targets = [];
    if (STATE.languages && STATE.languages.length && STATE.languageSelections) {
      for (var i = 0; i < STATE.languages.length; i++) {
        var id = STATE.languages[i].id;
        if (STATE.languageSelections[id] === true) targets.push(id);
      }
    }
    return targets;
  }

  /**
   * Upload strings, timeline screenshots, and (Phrase) publish jobs — same as Send Selected Compositions.
   * Required before AI Translation / Pseudo Translation when content has not been sent yet.
   */
  function exportSelectedCompsToTms(comps, uploadTargets, setStatus, popupSetProgress) {
    if (!comps || !comps.length) return false;
    if (!uploadTargets || !uploadTargets.length) return false;
    if (!STATE.projectId) { alertIf("Select a project first."); return false; }

    STATE.useSegmentation = (cbSegmentation && cbSegmentation.value === true);
    var allOk = true;

    if (IS_WIN) {
      var stringsUploads = [];
      for (var t = 0; t < uploadTargets.length; t++) {
        var currentTarget = uploadTargets[t];
        for (var c = 0; c < comps.length; c++) {
          var comp = comps[c];
          STATE.fileKey = safeFileKeyForComp(comp);
          STATE.compId = String(comp.id);
          var items = collectText(setStatus, comp);
          if (!items || !items.length) continue;
          var itemsToSend = [];
          for (var i = 0; i < items.length; i++) itemsToSend.push({ id: items[i].id, text: items[i].text });
          var payload = jsonStringifyMini({ fileKey: STATE.fileKey, items: itemsToSend });
          var fStrings = new File(tempPath("ct_win_export_" + t + "_" + c + ".json"));
          if (!writeTextFile(fStrings, payload)) { allOk = false; break; }
          var fields = [
            { name: "projectId", value: STATE.projectId },
            { name: "compId", value: STATE.compId },
            { name: "fileKey", value: STATE.fileKey },
            { name: "useSegmentation", value: STATE.useSegmentation ? "1" : "0" }
          ];
          if (currentTarget && currentTarget !== "all") fields.push({ name: "targetLanguage", value: currentTarget });
          stringsUploads.push({ path: fStrings.fsName, fields: fields });
        }
        if (!allOk) break;
      }
      if (!allOk) return false;
      if (stringsUploads.length === 0) {
        alertIf("No text layers found in the selected composition(s).");
        return false;
      }
      setStatus("Scanning timeline…");
      var scanManifest = [];
      for (var sc = 0; sc < comps.length; sc++) {
        try { app.project.activeItem = comps[sc]; } catch (eAct) {}
        STATE.fileKey = safeFileKeyForComp(comps[sc]);
        smartScanTimeline(function(){}, function(){}, comps[sc], scanManifest);
      }
      setStatus("Uploading…");
      var winResPath = tempPath("ct_win_export_res.txt");
      var winHeadPath = tempPath("ct_win_export_head.txt");
      var mi, su, cmd, item, one, scanCmd;
      try {
        for (var i = 0; i < stringsUploads.length; i++) {
          su = stringsUploads[i];
          cmd = buildStringsCurlCmd(su.path, su.fields);
          cmd += ' -o "' + pathForCurl(i === 0 ? winResPath : "nul") + '" "' + EP_STRINGS + '" -D "' + pathForCurl(i === 0 ? winHeadPath : "nul") + '"';
          run(cmd);
        }
        for (mi = 0; mi < scanManifest.length; mi++) {
          item = scanManifest[mi];
          var fkJsonFileWin = new File(tempPath("ct_fk_scan_" + safeScreenshotBase(item.fileKey || STATE.fileKey) + ".json"));
          try {
            if (!fkJsonFileWin.exists) {
              writeTextFile(fkJsonFileWin, jsonStringifyMini({ fileKey: item.fileKey || STATE.fileKey }));
            }
          } catch (eFkW) {}
          one = curlPostMultipartBuild(EP_SCAN_FRAME,
            scanFrameUploadFields(item.projectId, item.fileKey, item.t, item.ssName, item.ssWidth, item.ssHeight, item.cultStringId, mi),
            [
              { name: "png", path: item.pngPath, mime: "image/png" },
              { name: "boxes", path: item.boxesPath, mime: "application/json" },
              { name: "fileKeyJson", path: fkJsonFileWin.fsName, mime: "application/json" }
            ],
            "win_export_" + mi);
          scanCmd = one.cmd.replace(/-o\s+"[^"]*"/, '-o nul').replace(/-D\s+"[^"]*"/, '-D nul');
          scanCmd = scanCmd.replace(/\s--http2\s/, ' --http1.1 ');
          run(scanCmd);
        }
      } catch (eRun) {
        setStatus("Upload failed.");
        alertIf("Upload failed: " + (eRun && eRun.message ? eRun.message : String(eRun)));
        return false;
      }
      var resFile = new File(winResPath);
      var headFile = new File(winHeadPath);
      var http = readHttpCodeFromCurlResult(null, headFile);
      var body = resFile.exists ? readTextFile(resFile) : "";
      if (http !== "200") {
        setStatus("Upload failed.");
        alertIf("Upload strings failed.\nHTTP " + http + "\n\n" + body);
        return false;
      }
      if (TMS_PROVIDER === "phrase") {
        var pubSeenWin = {};
        for (var pubW = 0; pubW < stringsUploads.length; pubW++) {
          var suFld = stringsUploads[pubW].fields || [];
          var fkPub = "";
          for (var pubF = 0; pubF < suFld.length; pubF++) {
            if (suFld[pubF].name === "fileKey") { fkPub = String(suFld[pubF].value || ""); break; }
          }
          if (fkPub && !pubSeenWin[fkPub]) {
            pubSeenWin[fkPub] = true;
            if (!phraseAePublishExport(fkPub)) return false;
          }
        }
      }
      return true;
    }

    var anyStrings = false;
    for (var c2 = 0; c2 < comps.length; c2++) {
      var one = exportOneCompToTms(comps[c2], uploadTargets, setStatus);
      if (one === false) return false;
      if (one === true) anyStrings = true;
      if (popupSetProgress) popupSetProgress(c2 + 1, comps.length);
      try { app.refresh(); } catch (eRfMac) {}
    }
    if (!anyStrings) {
      alertIf("No text layers found in the selected composition(s).");
      return false;
    }
    return true;
  }

  /** One comp: strings (all targets) → scan → Phrase publish. true = ok, false = error, null = no text layers. */
  function exportOneCompToTms(comp, uploadTargets, setStatus) {
    if (!comp || !uploadTargets || !uploadTargets.length) return false;
    STATE.useSegmentation = (cbSegmentation && cbSegmentation.value === true);
    STATE.fileKey = safeFileKeyForComp(comp);
    STATE.compId = String(comp.id);
    var hadText = false;
    for (var t = 0; t < uploadTargets.length; t++) {
      var items = collectText(setStatus, comp);
      if (!items || !items.length) continue;
      hadText = true;
      if (!uploadStrings(items, setStatus, uploadTargets[t])) return false;
    }
    if (!hadText) return null;
    try { app.project.activeItem = comp; } catch (eAct) {}
    setStatus("Scanning timeline…");
    try { app.refresh(); } catch (eRf) {}
    smartScanTimeline(setStatus, function(cur, tot, msg) {
      if (setStatus && msg) setStatus(msg);
      try { app.refresh(); } catch (eR2) {}
    }, comp);
    if (TMS_PROVIDER === "phrase") {
      if (!phraseAePublishExport(STATE.fileKey)) return false;
    }
    return true;
  }

  /** Strings (+ Phrase publish) only — no timeline screenshots (AI Translation). */
  function exportOneCompStringsOnly(comp, uploadTargets, setStatus) {
    if (!comp || !uploadTargets || !uploadTargets.length) return false;
    STATE.useSegmentation = (cbSegmentation && cbSegmentation.value === true);
    STATE.fileKey = safeFileKeyForComp(comp);
    STATE.compId = String(comp.id);
    var items = collectText(setStatus, comp);
    if (!items || !items.length) return null;
    for (var t = 0; t < uploadTargets.length; t++) {
      if (!uploadStrings(items, setStatus, uploadTargets[t])) return false;
    }
    if (TMS_PROVIDER === "phrase") {
      if (!phraseAePublishExport(STATE.fileKey)) return false;
    }
    return true;
  }

  /** Upload strings for all comps; optional screenshots via includeScreenshots. */
  function exportStringsForComps(comps, uploadTargets, setStatus, popupSetProgress, includeScreenshots) {
    if (!comps || !comps.length) return false;
    if (!uploadTargets || !uploadTargets.length) return false;
    if (!STATE.projectId) { alertIf("Select a project first."); return false; }
    STATE.useSegmentation = (cbSegmentation && cbSegmentation.value === true);

    if (includeScreenshots) {
      return exportSelectedCompsToTms(comps, uploadTargets, setStatus, popupSetProgress);
    }

    if (IS_WIN) {
      var stringsUploads = [];
      var allOk = true;
      for (var t = 0; t < uploadTargets.length; t++) {
        var currentTarget = uploadTargets[t];
        for (var c = 0; c < comps.length; c++) {
          var comp = comps[c];
          STATE.fileKey = safeFileKeyForComp(comp);
          STATE.compId = String(comp.id);
          var items = collectText(setStatus, comp);
          if (!items || !items.length) continue;
          var itemsToSend = [];
          for (var i = 0; i < items.length; i++) itemsToSend.push({ id: items[i].id, text: items[i].text });
          var payload = jsonStringifyMini({ fileKey: STATE.fileKey, items: itemsToSend });
          var fStrings = new File(tempPath("ct_win_str_" + t + "_" + c + ".json"));
          if (!writeTextFile(fStrings, payload)) { allOk = false; break; }
          var fields = [
            { name: "projectId", value: STATE.projectId },
            { name: "compId", value: STATE.compId },
            { name: "fileKey", value: STATE.fileKey },
            { name: "useSegmentation", value: STATE.useSegmentation ? "1" : "0" }
          ];
          if (currentTarget && currentTarget !== "all") fields.push({ name: "targetLanguage", value: currentTarget });
          stringsUploads.push({ path: fStrings.fsName, fields: fields });
        }
        if (!allOk) break;
      }
      if (!allOk) return false;
      if (stringsUploads.length === 0) {
        alertIf("No text layers found in the selected composition(s).");
        return false;
      }
      setStatus("Uploading strings…");
      var winResPath = tempPath("ct_win_str_res.txt");
      var winHeadPath = tempPath("ct_win_str_head.txt");
      for (var si = 0; si < stringsUploads.length; si++) {
        var su = stringsUploads[si];
        var cmd = buildStringsCurlCmd(su.path, su.fields);
        cmd += ' -o "' + pathForCurl(si === 0 ? winResPath : "nul") + '" "' + EP_STRINGS + '" -D "' + pathForCurl(si === 0 ? winHeadPath : "nul") + '"';
        run(cmd);
      }
      var http = readHttpCodeFromCurlResult(null, new File(winHeadPath));
      if (http !== "200") {
        var body = readTextFile(new File(winResPath));
        alertIf("Upload strings failed.\nHTTP " + http + "\n\n" + body);
        return false;
      }
      if (TMS_PROVIDER === "phrase") {
        var pubSeen = {};
        for (var pubW = 0; pubW < stringsUploads.length; pubW++) {
          var suFld = stringsUploads[pubW].fields || [];
          var fkPub = "";
          for (var pubF = 0; pubF < suFld.length; pubF++) {
            if (suFld[pubF].name === "fileKey") { fkPub = String(suFld[pubF].value || ""); break; }
          }
          if (fkPub && !pubSeen[fkPub]) {
            pubSeen[fkPub] = true;
            if (!phraseAePublishExport(fkPub)) return false;
          }
        }
      }
      return true;
    }

    var anyStrings = false;
    for (var c2 = 0; c2 < comps.length; c2++) {
      var one = exportOneCompStringsOnly(comps[c2], uploadTargets, setStatus);
      if (one === false) return false;
      if (one === true) anyStrings = true;
      if (popupSetProgress) popupSetProgress(c2 + 1, comps.length);
      try { app.refresh(); } catch (eRfMac) {}
    }
    if (!anyStrings) {
      alertIf("No text layers found in the selected composition(s).");
      return false;
    }
    return true;
  }

  // =========================
  // SMART SCAN (strict + fallback + rescue bbox)
  // =========================

  function layerOpacityAt(layer, t){
    try{
      var tr = layer.property("ADBE Transform Group");
      if (!tr) return 100;
      var op = tr.property("ADBE Opacity");
      if (!op) return 100;
      return Number(op.valueAtTime(t, false)); // 0..100
    }catch(e){ return 100; }
  }

  /** Scale at time t (min of X,Y). Returns 1 if no scale or error. Do not use || 100 so that scale 0 is preserved. */
  function layerScaleAt(layer, t){
    try{
      var tr = layer.property("ADBE Transform Group");
      if (!tr) return 1;
      var scaleProp = tr.property("ADBE Scale");
      if (!scaleProp) return 1;
      var v = scaleProp.valueAtTime(t, false);
      if (!v || v.length < 2) return 1;
      var sx = Number(v[0]);
      var sy = Number(v[1]);
      if (!isFinite(sx)) sx = 100;
      if (!isFinite(sy)) sy = 100;
      return Math.min(sx, sy) / 100;
    }catch(e){ return 1; }
  }

  function layerEligible(layer, t){
    try{
      if (!layer.enabled) return false;
      if (t < layer.inPoint || t > layer.outPoint) return false;
      if (layerOpacityAt(layer, t) < MIN_OPACITY) return false;
      if (layerScaleAt(layer, t) < MIN_SCALE) return false;
      return true;
    }catch(e){ return false; }
  }

  function toCompSafe(layer, xy){
    try{
      if (layer.threeDLayer) return layer.toComp([xy[0], xy[1], 0]);
      return layer.toComp([xy[0], xy[1]]);
    }catch(e){
      return null;
    }
  }

  /** Transform a point from layer's source comp space to layer's containing comp space at time t, using valueAtTime (does not set comp.time). */
  function layerPointToCompAtTime(layer, point, t) {
    try {
      var tr = layer.property("ADBE Transform Group");
      if (!tr) return null;
      var pos = tr.property("ADBE Position");
      var anc = tr.property("ADBE Anchor Point");
      var scl = tr.property("ADBE Scale");
      var rot = tr.property("ADBE Rotate Z");
      if (!pos || !anc || !scl || !rot) return null;
      var pv = pos.valueAtTime(t, false);
      var av = anc.valueAtTime(t, false);
      var sv = scl.valueAtTime(t, false);
      var rv = rot.valueAtTime(t, false);
      if (!pv || pv.length < 2) return null;
      var px = Number(pv[0]), py = Number(pv[1]);
      var ax = av && av.length >= 2 ? Number(av[0]) : 0;
      var ay = av && av.length >= 2 ? Number(av[1]) : 0;
      var sx = (sv && sv[0] != null) ? Number(sv[0]) / 100 : 1;
      var sy = (sv && sv[1] != null) ? Number(sv[1]) / 100 : 1;
      var r = (rv != null) ? Number(rv) * Math.PI / 180 : 0;
      var dx = point[0] - ax, dy = point[1] - ay;
      dx *= sx; dy *= sy;
      var cos = Math.cos(r), sin = Math.sin(r);
      return [px + (dx * cos - dy * sin), py + (dx * sin + dy * cos)];
    } catch (e) { return null; }
  }

  function pointInComp(comp, p, margin){
    margin = (margin == null) ? 10 : margin;
    if (!comp || !p) return false;
    return (p[0] >= -margin && p[0] <= comp.width + margin && p[1] >= -margin && p[1] <= comp.height + margin);
  }

  function originInComp(layer, comp){
    var p0 = toCompSafe(layer, [0,0]);
    return (p0 && pointInComp(comp, p0, 10));
  }

  /** Position [x, y] at time t (layer space). Returns null if not available. */
  function getLayerPositionAtTime(layer, t) {
    try {
      var tr = layer.property("ADBE Transform Group");
      if (!tr) return null;
      var pos = tr.property("ADBE Position");
      if (!pos) return null;
      var v = pos.valueAtTime(t, false);
      if (!v || v.length < 2) return null;
      return [Number(v[0]), Number(v[1])];
    } catch (e) { return null; }
  }

  /**
   * True if the layer is "paused" at t: position (and scale) are stable over a short window.
   * Prefer the first moment of a hold: require stability forward (t to t+step). Only require
   * stability backward (t-step to t) when t-step is within layer bounds, so we don't fail at the very first frame of a hold.
   */
  var PAUSE_POSITION_TOLERANCE = 1;
  var PAUSE_SCALE_TOLERANCE = 0.005;
  function isLayerPausedAt(layer, comp, t) {
    try {
      var step = comp.frameDuration || (1 / 24);
      if (!isFinite(step) || step <= 0) step = 1 / 24;
      var tPrev = t - step;
      var tNext = t + step;
      if (tPrev < layer.inPoint) tPrev = layer.inPoint;
      if (tNext > layer.outPoint) tNext = layer.outPoint;
      var p0 = getLayerPositionAtTime(layer, t);
      if (!p0) return false;
      var pPrev = getLayerPositionAtTime(layer, tPrev);
      var pNext = getLayerPositionAtTime(layer, tNext);
      // Always require stable going forward (so we're at the start of a hold)
      if (pNext && (Math.abs(p0[0] - pNext[0]) > PAUSE_POSITION_TOLERANCE || Math.abs(p0[1] - pNext[1]) > PAUSE_POSITION_TOLERANCE)) return false;
      // Require stable from previous frame only when we have a valid previous frame (not at layer start)
      if (tPrev >= layer.inPoint && pPrev && (Math.abs(p0[0] - pPrev[0]) > PAUSE_POSITION_TOLERANCE || Math.abs(p0[1] - pPrev[1]) > PAUSE_POSITION_TOLERANCE)) return false;
      var s0 = layerScaleAt(layer, t);
      var sPrev = layerScaleAt(layer, tPrev);
      var sNext = layerScaleAt(layer, tNext);
      if (Math.abs(s0 - sNext) > PAUSE_SCALE_TOLERANCE) return false;
      if (tPrev >= layer.inPoint && Math.abs(s0 - sPrev) > PAUSE_SCALE_TOLERANCE) return false;
      return true;
    } catch (e) { return false; }
  }

  /** Transform a point from layer's source comp space to layer's containing comp space at time t, using valueAtTime (does not set comp.time). */
  function layerPointToCompAtTime(layer, point, t) {
    try {
      var tr = layer.property("ADBE Transform Group");
      if (!tr) return null;
      var pos = tr.property("ADBE Position");
      var anc = tr.property("ADBE Anchor Point");
      var scl = tr.property("ADBE Scale");
      var rot = tr.property("ADBE Rotate Z");
      if (!pos || !anc || !scl || !rot) return null;
      var pv = pos.valueAtTime(t, false);
      var av = anc.valueAtTime(t, false);
      var sv = scl.valueAtTime(t, false);
      var rv = rot.valueAtTime(t, false);
      if (!pv || pv.length < 2) return null;
      var px = Number(pv[0]), py = Number(pv[1]);
      var ax = av && av.length >= 2 ? Number(av[0]) : 0;
      var ay = av && av.length >= 2 ? Number(av[1]) : 0;
      var sx = (sv && sv[0] != null) ? Number(sv[0]) / 100 : 1;
      var sy = (sv && sv[1] != null) ? Number(sv[1]) / 100 : 1;
      var r = (rv != null) ? Number(rv) * Math.PI / 180 : 0;
      var dx = point[0] - ax, dy = point[1] - ay;
      dx *= sx; dy *= sy;
      var cos = Math.cos(r), sin = Math.sin(r);
      return [px + (dx * cos - dy * sin), py + (dx * sin + dy * cos)];
    } catch (e) { return null; }
  }

  /** Position offset [dx, dy] in layer space from Transform/Position effects at time t (so bbox matches rendered text). Returns null if none. */
  function getEffectPositionOffsetAtTime(layer, t) {
    try {
      var parade = layer.property("ADBE Effect Parade");
      if (!parade || !parade.numProperties) return null;
      function findPositionOffset(grp) {
        if (!grp || !grp.numProperties) return null;
        for (var i = 1; i <= grp.numProperties; i++) {
          var p = grp.property(i);
          if (!p) continue;
          var posProp = null, anchorProp = null;
          if (p.numProperties != null && p.numProperties > 0) {
            for (var j = 1; j <= p.numProperties; j++) {
              var sub = p.property(j);
              if (!sub) continue;
              var name = (sub.name || "").toString();
              var mn = (sub.matchName || "").toString();
              if (name === "Position" || mn.indexOf("Position") >= 0) posProp = sub;
              if (name === "Anchor Point" || mn.indexOf("Anchor") >= 0) anchorProp = sub;
            }
            if (posProp) {
              var pv = posProp.valueAtTime(t, false);
              if (!pv || pv.length < 2) continue;
              var dx = Number(pv[0]), dy = Number(pv[1]);
              if (anchorProp) {
                try {
                  var av = anchorProp.valueAtTime(t, false);
                  if (av && av.length >= 2) {
                    dx -= Number(av[0]);
                    dy -= Number(av[1]);
                  }
                } catch (eA) {}
              }
              return [dx, dy];
            }
            var fromGroup = findPositionOffset(p);
            if (fromGroup) return fromGroup;
          }
        }
        return null;
      }
      return findPositionOffset(parade);
    } catch (e) { return null; }
  }

  /** Single rule for screenshot time: Snapshot Marker when present, else second keyframe or midpoint. allowSnapshotMarker: when true (default), marker is preferred when the layer has one. */
  function getScreenshotTimeForLayer(layer, a, b, allowSnapshotMarker) {
    if (allowSnapshotMarker === undefined) allowSnapshotMarker = true;
    var list = getPreferredScreenshotTimes(layer, a, b, allowSnapshotMarker);
    return (list && list.length > 0) ? list[0] : ((Number(a) + Number(b)) / 2);
  }

  /** All preferred times for this layer: Snapshot Marker first when present, then second keyframes and other keyframe times + midpoint, sorted, clamped to [a,b]. */
  function getPreferredScreenshotTimes(layer, a, b, allowSnapshotMarker) {
    if (allowSnapshotMarker === undefined) allowSnapshotMarker = true;
    try {
      var aNum = Number(a);
      var bNum = Number(b);
      if (!isFinite(aNum) || !isFinite(bNum) || bNum - aNum < 0.01) return [(aNum + bNum) / 2];
      var midpoint = (aNum + bNum) / 2;
      var step = 1 / 24;
      try { if (layer.comp) step = layer.comp.frameDuration || step; } catch (e) {}

      var primary = midpoint;
      var primarySet = false;
      var primaryFromRangeReveal = false;
      var rangeRevealTime = null;
      if (layer.matchName === "ADBE Text Layer") {
        rangeRevealTime = getTimeWhenRangeSelectorAnimatorReveal(layer, aNum, bNum);
      }
      if (allowSnapshotMarker) {
        var snapshotTime = getSnapshotMarkerTime(layer);
        if (snapshotTime != null && isFinite(snapshotTime) && snapshotTime >= aNum - 0.001 && snapshotTime <= bNum + 0.001) {
          primary = snapshotTime;
          primarySet = true;
        }
      }

      // Set active comp to the layer's comp so keyframe reads work (critical for text inside precomps).
      var layerComp = null;
      var prevActive = null;
      try {
        layerComp = layer.comp;
        if (layerComp && app.project && app.project.activeItem !== layerComp) {
          prevActive = app.project.activeItem;
          app.project.activeItem = layerComp;
        }
        if (layerComp) {
          try { layerComp.time = aNum; } catch (eTime) {}
        }
      } catch (eSwitch) {}

      function allKeyTimesFromProp(prop, out) {
        if (!prop) return;
        try {
          var n = (prop.numKeys != null) ? prop.numKeys : 0;
          for (var k = 1; k <= n; k++) {
            var kt = prop.keyTime(k);
            if (kt != null && isFinite(kt)) out.push(kt);
          }
        } catch (e) {}
        if (prop.numProperties != null && prop.numProperties >= 1) {
          for (var d = 1; d <= Math.min(prop.numProperties, 5); d++) {
            try {
              var dim = prop.property(d);
              if (dim && dim.numKeys != null) {
                for (var kd = 1; kd <= dim.numKeys; kd++) {
                  var ktd = dim.keyTime(kd);
                  if (ktd != null && isFinite(ktd)) out.push(ktd);
                }
              }
            } catch (ed) {}
          }
        }
      }
      function collectAllKeyTimes(grp, out) {
        if (!grp || !grp.numProperties) return;
        for (var i = 1; i <= grp.numProperties; i++) {
          try {
            var p = grp.property(i);
            if (!p) continue;
            allKeyTimesFromProp(p, out);
            if (p.numProperties != null && p.numProperties > 0) collectAllKeyTimes(p, out);
          } catch (e) {}
        }
      }
      var times = [];
      var transform = layer.property("ADBE Transform Group");
      if (transform) collectAllKeyTimes(transform, times);
      var parade = layer.property("ADBE Effect Parade");
      if (parade) collectAllKeyTimes(parade, times);
      if (layer.matchName === "ADBE Text Layer") {
        var tp = layer.property("ADBE Text Properties");
        if (tp) collectAllKeyTimes(tp, times);
      }
      times.push(midpoint);
      // Simple typewriter (no keyframes): add tail times so multiple typewriter layers each get a slot when text is fully revealed.
      if (times.length <= 1) {
        for (var tail = 0.7; tail <= 1; tail += 0.1) times.push(aNum + (bNum - aNum) * tail);
        times.push(bNum);
      }
      var seen = {};
      var unique = [];
      for (var j = 0; j < times.length; j++) {
        var t = Math.max(aNum, Math.min(bNum, times[j]));
        var k = Math.round(t / step).toString();
        if (!seen[k]) { seen[k] = true; unique.push(t); }
      }
      unique.sort(function (x, y) { return x - y; });
      if (unique.length === 0) return [midpoint];
      // Keep primary/primarySet from Snapshot Marker above; only set from second keyframe or fallback when not already set.
      function keyTime2FromProp(prop) {
        if (!prop) return null;
        try {
          if (prop.numKeys != null && prop.numKeys >= 2) return prop.keyTime(2);
        } catch (e) {}
        if (prop.numProperties != null && prop.numProperties >= 1) {
          for (var d = 1; d <= Math.min(prop.numProperties, 5); d++) {
            try {
              var dim = prop.property(d);
              if (dim && dim.numKeys != null && dim.numKeys >= 2) return dim.keyTime(2);
            } catch (ed) {}
          }
        }
        return null;
      }
      // Collect every property's keyTime(2) from Transform, Effect Parade, Text (recursive).
      function collectAllKeyTime2(grp, out) {
        if (!grp || !grp.numProperties) return;
        for (var i = 1; i <= grp.numProperties; i++) {
          try {
            var p = grp.property(i);
            if (!p) continue;
            var kt = keyTime2FromProp(p);
            if (kt != null && isFinite(kt)) out.push(kt);
            if (p.numProperties > 0) collectAllKeyTime2(p, out);
          } catch (e) {}
        }
      }
      var allKeyTime2 = [];
      if (!primarySet && rangeRevealTime != null && isFinite(rangeRevealTime)) {
        primary = rangeRevealTime;
        primarySet = true;
        primaryFromRangeReveal = true;
      }
      if (transform) collectAllKeyTime2(transform, allKeyTime2);
      if (parade) collectAllKeyTime2(parade, allKeyTime2);
      if (layer.matchName === "ADBE Text Layer") {
        var tpp = layer.property("ADBE Text Properties");
        if (tpp) collectAllKeyTime2(tpp, allKeyTime2);
        try {
          var srcDoc = tpp.property("ADBE Text Document");
          if (srcDoc) {
            var ktDoc = keyTime2FromProp(srcDoc);
            if (ktDoc != null && isFinite(ktDoc)) allKeyTime2.push(ktDoc);
          }
        } catch (eDoc) {}
      }
      // Fallback: earliest keyTime(2) on Transform / effects / text (not ideal for Offset typewriters).
      if (!primarySet && allKeyTime2.length > 0) {
        var earliest = allKeyTime2[0];
        for (var ei = 1; ei < allKeyTime2.length; ei++) {
          if (allKeyTime2[ei] < earliest) earliest = allKeyTime2[ei];
        }
        primary = Math.max(aNum, Math.min(bNum, earliest));
        primarySet = true;
      }
      if (!primarySet) {
        primary = aNum + (bNum - aNum) * 0.9;
        if (primary > bNum) primary = bNum;
        if (primary < aNum) primary = aNum;
      }
      var result = [primary];
      var others = [];
      for (var r = 0; r < unique.length; r++) {
        if (Math.abs(unique[r] - primary) > 0.001) {
          if (primaryFromRangeReveal && unique[r] < primary - 0.001) continue;
          others.push(unique[r]);
        }
      }
      others.sort(function (x, y) { return x - y; });
      for (var o = 0; o < others.length; o++) result.push(others[o]);
      return result.length ? result : [midpoint];
    } catch (e) {
      var an = Number(a), bn = Number(b);
      return [(isFinite(an) && isFinite(bn)) ? (an + bn) / 2 : 0];
    } finally {
      if (prevActive && app.project) {
        try { app.project.activeItem = prevActive; } catch (eRestore) {}
      }
    }
  }

  function getSecondKeyframeTimeForEffectPosition(layer) {
    try {
      var parade = layer.property("ADBE Effect Parade");
      if (!parade || !parade.numProperties) return null;
      function keyTime2FromProp(prop) {
        if (!prop) return null;
        try {
          if (prop.numKeys != null && prop.numKeys >= 2) return prop.keyTime(2);
        } catch (e) {}
        if (prop.numProperties != null && prop.numProperties >= 1) {
          for (var d = 1; d <= Math.min(prop.numProperties, 3); d++) {
            var dim = prop.property(d);
            if (dim && dim.numKeys != null && dim.numKeys >= 2) {
              try {
                return dim.keyTime(2);
              } catch (ed) {}
            }
          }
        }
        return null;
      }
      function findPosPropSecondKey(grp) {
        if (!grp || !grp.numProperties) return null;
        for (var i = 1; i <= grp.numProperties; i++) {
          var p = grp.property(i);
          if (!p) continue;
          if (p.numProperties != null && p.numProperties > 0) {
            for (var j = 1; j <= p.numProperties; j++) {
              var sub = p.property(j);
              if (!sub) continue;
              var name = (sub.name || "").toString();
              var mn = (sub.matchName || "").toString();
              if (name === "Position" || mn.indexOf("Position") >= 0) {
                var kt2 = keyTime2FromProp(sub);
                if (kt2 != null && isFinite(kt2)) return kt2;
              }
            }
            var fromGroup = findPosPropSecondKey(p);
            if (fromGroup != null) return fromGroup;
          }
        }
        return null;
      }
      return findPosPropSecondKey(parade);
    } catch (e) { return null; }
  }

  /** Source rect in comp space (layer transform only). Used for bbox/highlight. */
  function bboxFromSourceRect(layer, t) {
    try{
      var r = null;
      try { r = layer.sourceRectAtTime(t, false); } catch(e0){ r = null; }
      if (!r || r.width <= 0.1 || r.height <= 0.1) { try { r = layer.sourceRectAtTime(t, true); } catch(e1){ r = null; } }
      if (!r || r.width <= 0.1 || r.height <= 0.1) return null;

      var x1 = r.left, y1 = r.top;
      var x2 = r.left + r.width, y2 = r.top + r.height;

      var offset = getEffectPositionOffsetAtTime(layer, t);
      if (offset && offset.length >= 2) {
        x1 += Number(offset[0]); y1 += Number(offset[1]);
        x2 += Number(offset[0]); y2 += Number(offset[1]);
      }

      var p1 = layerPointToCompAtTime(layer, [x1, y1], t);
      var p2 = layerPointToCompAtTime(layer, [x2, y1], t);
      var p3 = layerPointToCompAtTime(layer, [x1, y2], t);
      var p4 = layerPointToCompAtTime(layer, [x2, y2], t);

      if (!p1 || !p2 || !p3 || !p4) return null;

      var minX = Math.min(p1[0], p2[0], p3[0], p4[0]);
      var maxX = Math.max(p1[0], p2[0], p3[0], p4[0]);
      var minY = Math.min(p1[1], p2[1], p3[1], p4[1]);
      var maxY = Math.max(p1[1], p2[1], p3[1], p4[1]);

      var w = maxX - minX, h = maxY - minY;
      if (w < 0.1 || h < 0.1) return null;

      if (BBOX_TIGHTEN_RATIO < 1 && w >= 4 && h >= 4) {
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var halfW = w / 2, halfH = h / 2;
        halfW *= BBOX_TIGHTEN_RATIO;
        halfH *= BBOX_TIGHTEN_RATIO;
        minX = cx - halfW; maxX = cx + halfW;
        minY = cy - halfH; maxY = cy + halfH;
        w = maxX - minX; h = maxY - minY;
      }

      return { x: minX, y: minY, w: w, h: h };
    }catch(e){
      return null;
    }
  }

  function bboxEstimateFromTextDoc(layer, t){
    try{
      var sp = getSourceTextProp(layer);
      if (!sp) return null;

      var doc = sp.valueAtTime(t, false);
      var text = String(doc.text || "");
      text = text.replace(/\r/g, "\n");

      var lines = text.split("\n");
      var lineCount = Math.max(1, lines.length);

      var maxLen = 1;
      for (var i=0;i<lines.length;i++){
        if (lines[i].length > maxLen) maxLen = lines[i].length;
      }

      var fs = Number(doc.fontSize || 40);
      if (!isFinite(fs) || fs <= 0) fs = 40;

      var w = clamp(fs * 0.52 * maxLen, 40, 1600);
      var h = clamp(fs * 1.22 * lineCount, 30, 900);

      var p = toCompSafe(layer, [0,0]);
      if (!p) return null;

      return { x: p[0] - w/2, y: p[1] - h/2, w: w, h: h };
    }catch(e){
      return null;
    }
  }

  /** Like bboxEstimateFromTextDoc but uses the completed/full text (cursor stripped, max length over layer)
   * so the highlight matches the fully formed text. Use when capturing at typewriter full-reveal with
   * blinking cursor. When comp is passed, dimensions are based on getCompletedTextForLayer so the box
   * is never minimal (e.g. when source at t is just "|"). */
  function bboxEstimateFromTextDocNoCursor(layer, t, comp) {
    try {
      var sp = getSourceTextProp(layer);
      if (!sp) return null;

      var doc = sp.valueAtTime(t, false);
      var fs = Number(doc.fontSize || 40);
      if (!isFinite(fs) || fs <= 0) fs = 40;

      var text;
      if (comp) {
        text = getCompletedTextForLayer(layer, comp);
        if (!text) text = String(doc.text || "");
      } else {
        text = String(doc.text || "");
        text = stripBlinkingCursorCursor(text);
      }
      text = text.replace(/\r/g, "\n");
      var lines = text.split("\n");
      var lineCount = Math.max(1, lines.length);
      var maxLen = 1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].length > maxLen) maxLen = lines[i].length;
      }

      var w = clamp(fs * 0.52 * maxLen, 40, 1600);
      var h = clamp(fs * 1.22 * lineCount, 30, 900);

      var p = toCompSafe(layer, [0, 0]);
      if (!p) return null;

      return { x: p[0] - w / 2, y: p[1] - h / 2, w: w, h: h };
    } catch (e) {
      return null;
    }
  }

  // ✅ NEW: last-resort bbox from Position (very reliable)
  function bboxFromPositionRescue(layer, comp, t){
    try{
      var tr = layer.property("ADBE Transform Group");
      if (!tr) return null;
      var pos = tr.property("ADBE Position");
      if (!pos) return null;

      var v = pos.valueAtTime(t, false);
      if (!v || v.length < 2) return null;

      var x = Number(v[0]), y = Number(v[1]);
      if (!isFinite(x) || !isFinite(y)) return null;

      var w = Math.min(RESCUE_BBOX_W, comp.width);
      var h = Math.min(RESCUE_BBOX_H, comp.height);

      return { x: x - w/2, y: y - h/2, w: w, h: h };
    }catch(e){
      return null;
    }
  }

  // Detect native Blinking Cursor Typewriter preset by inspecting the Source Text expression
  // (more reliable than effect names). Match multiple possible phrasings so all layers get the fix.
  function hasBlinkingCursorTypewriterEffect(layer) {
    try {
      if (!layer || layer.matchName !== "ADBE Text Layer") return false;
      var sp = getSourceTextProp(layer);
      if (!sp) return false;
      var expr = "";
      try { expr = String(sp.expression || ""); } catch (eExpr) { expr = ""; }
      if (!expr) return false;
      var e = expr.replace(/\s+/g, " ");
      if (e.indexOf("Blinking Cursor Typewriter") >= 0) return true;
      if (e.indexOf("Cursor Shape") >= 0 && (e.indexOf("Animation") >= 0 || e.indexOf("linear(") >= 0) && e.indexOf("reveal") >= 0) return true;
      if (e.indexOf("effect(") >= 0 && e.indexOf("Animation") >= 0 && (e.indexOf("slice(") >= 0 || e.indexOf("reveal") >= 0)) return true;
    } catch (eOuter) {}
    return false;
  }

  // For Blinking Cursor preset, measure full-text bbox at t WITHOUT modifying any effect (read-only).
  // Uses cached full-text dimensions per layer; position comes from sourceRect at t (left/top of visible text) so highlight aligns correctly.
  function getBlinkFullTextBboxReadOnly(layer, comp, tCapture) {
    try {
      if (!layer || layer.matchName !== "ADBE Text Layer") return null;
      if (!hasBlinkingCursorTypewriterEffect(layer)) return null;

      var ck = layer.id;
      if (__blinkFullTextSizeCache[ck] === undefined) {
        var fullBox = bboxEstimateFromTextDocNoCursor(layer, Math.max(0, Number(layer.inPoint || 0)), comp);
        __blinkFullTextSizeCache[ck] = fullBox ? { w: fullBox.w, h: fullBox.h } : null;
      }
      var cached = __blinkFullTextSizeCache[ck];
      if (!cached || cached.w < 2 || cached.h < 2) return null;

      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      var t = (tCapture != null && tCapture >= a && tCapture <= b) ? tCapture : (a + (b - a) * 0.8);

      // Use visible text bounds at t for position (left/top) so highlight aligns with actual text, not anchor.
      var bbSource = bboxFromSourceRect(layer, t);
      if (!bbSource) return null;

      var x = bbSource.x;
      var y = bbSource.y;
      var w = cached.w;
      var h = cached.h;
      // At full-reveal frame, sourceRect may already be the full text; use it when it's close to full size.
      if (bbSource.w >= cached.w * 0.85 && bbSource.h >= cached.h * 0.85) {
        w = bbSource.w;
        h = bbSource.h;
      }
      x -= Math.min(w * 0.08, 12);
      if (x < 0) x = 0;
      return { x: x, y: y, w: w, h: h };
    } catch (eOuter) {
      return null;
    }
  }

  // For Blinking Cursor preset, measure full-text geometry at capture time t with the
  // \"Animation\" control temporarily forced to 100, so sourceRect reflects the full text
  // and the bbox position matches the frame we're capturing.
  function getBlinkFullTextBbox(layer, comp, tCapture) {
    try {
      if (!layer || layer.matchName !== "ADBE Text Layer") return null;
      if (!hasBlinkingCursorTypewriterEffect(layer)) return null;
      var eff = null;
      try { eff = layer.effect("Animation"); } catch (e0) {}
      if (!eff) {
        try {
          var parade = layer.property("ADBE Effect Parade");
          if (parade && parade.numProperties) {
            for (var i = 1; i <= parade.numProperties; i++) {
              var e = null;
              try { e = parade.property(i); } catch (e1) {}
              if (e && e.name && String(e.name) === "Animation") { eff = e; break; }
            }
          }
        } catch (eFind) {}
      }
      if (!eff) {
        try {
          var animIn = layer.effect("Animate In");
          if (animIn && animIn.numProperties) {
            for (var k = 1; k <= animIn.numProperties; k++) {
              var sub = null;
              try { sub = animIn.property(k); } catch (eSub) {}
              if (!sub || !sub.numProperties) continue;
              for (var j = 1; j <= sub.numProperties; j++) {
                var prop = null;
                try { prop = sub.property(j); } catch (eP2) {}
                if (prop && prop.name && String(prop.name) === "Animation") { eff = sub; break; }
              }
              if (eff) break;
            }
          }
        } catch (eAnimIn) {}
      }
      if (!eff) return null;
      var ctrl = null;
      try { ctrl = eff.property(1); } catch (eP) {}
      if (!ctrl || (ctrl.name && String(ctrl.name) !== "Animation")) {
        try {
          var n = eff.numProperties || 0;
          for (var idx = 1; idx <= n; idx++) {
            var p = eff.property(idx);
            if (p && p.name && String(p.name) === "Animation") { ctrl = p; break; }
          }
        } catch (eSearch) {}
      }
      if (!ctrl) return null;

      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      var t = (tCapture != null && tCapture >= a && tCapture <= b) ? tCapture : (a + (b - a) * 0.8);

      var hadKeys = false, tempIndex = 0, backupVal = null;
      var result = null;
      try {
        if (ctrl.numKeys > 0) {
          hadKeys = true;
          tempIndex = ctrl.addKey(t);
          ctrl.setValueAtKey(tempIndex, 100);
        } else {
          backupVal = ctrl.value;
          ctrl.setValue(100);
        }

        var r = null;
        try { r = layer.sourceRectAtTime(t, false); } catch (eSR0) { r = null; }
        if (!r || r.width <= 0.1 || r.height <= 0.1) {
          try { r = layer.sourceRectAtTime(t, true); } catch (eSR1) { r = null; }
        }
        if (!r || r.width <= 0.1 || r.height <= 0.1) return null;

        var x1 = r.left, y1 = r.top;
        var x2 = r.left + r.width, y2 = r.top + r.height;
        var p1 = layerPointToCompAtTime(layer, [x1, y1], t);
        var p2 = layerPointToCompAtTime(layer, [x2, y2], t);
        var p3 = layerPointToCompAtTime(layer, [x1, y2], t);
        var p4 = layerPointToCompAtTime(layer, [x2, y2], t);
        if (!p1 || !p2 || !p3 || !p4) return null;

        var minX = Math.min(p1[0], p2[0], p3[0], p4[0]);
        var maxX = Math.max(p1[0], p2[0], p3[0], p4[0]);
        var minY = Math.min(p1[1], p2[1], p3[1], p4[1]);
        var maxY = Math.max(p1[1], p2[1], p3[1], p4[1]);
        var w = maxX - minX, h = maxY - minY;
        if (w < 0.1 || h < 0.1) return null;
        minX -= Math.min(w * 0.08, 12);
        if (minX < 0) minX = 0;
        w = maxX - minX;
        result = { x: minX, y: minY, w: w, h: h };
      } finally {
        try {
          if (hadKeys && tempIndex > 0 && tempIndex <= (ctrl.numKeys || 0)) ctrl.removeKey(tempIndex);
          else if (!hadKeys && backupVal != null) ctrl.setValue(backupVal);
        } catch (eR) {}
      }
      return result;
    } catch (eOuter) {
      return null;
    }
  }

  function bboxForLayer(layer, comp, t){
    // Only for Typewriter Blinking Cursor: use full-text size (completed text at 100%) so highlight isn't just the cursor "|".
    if (layer && layer.matchName === "ADBE Text Layer" && hasBlinkingCursorTypewriterEffect(layer)) {
      var bbFull = bboxEstimateFromTextDocNoCursor(layer, t, comp);
      if (bbFull && bbFull.w >= 2 && bbFull.h >= 2) return { bbox: bbFull, source: "blinkFullText" };
    }
    var bb = bboxFromSourceRect(layer, t);
    if (bb) return { bbox: bb, source: 'sourceRect' };

    bb = bboxEstimateFromTextDoc(layer, t);
    if (bb) return { bbox: bb, source: 'estimate' };

    bb = bboxFromPositionRescue(layer, comp, t);
    if (bb) return { bbox: bb, source: 'rescue' };

    return null;
  }

  function bboxIntersectsComp(comp, bb){
    if (!comp || !bb) return false;
    if (bb.w < 2 || bb.h < 2) return false;

    var x1 = bb.x, y1 = bb.y, x2 = bb.x + bb.w, y2 = bb.y + bb.h;
    var ix1 = Math.max(0, x1);
    var iy1 = Math.max(0, y1);
    var ix2 = Math.min(comp.width,  x2);
    var iy2 = Math.min(comp.height, y2);

    return (ix2 - ix1) >= 2 && (iy2 - iy1) >= 2;
  }

  /** True if bb overlaps refRect by at least 2px. Use when refRect is effective comp (full comp or matte). */
  function bboxIntersectsRect(bb, refRect) {
    if (!bb || !refRect || bb.w < 2 || bb.h < 2) return false;
    var ix1 = Math.max(refRect.x, bb.x);
    var iy1 = Math.max(refRect.y, bb.y);
    var ix2 = Math.min(refRect.x + refRect.w, bb.x + bb.w);
    var iy2 = Math.min(refRect.y + refRect.h, bb.y + bb.h);
    return (ix2 - ix1) >= 2 && (iy2 - iy1) >= 2;
  }

  function intersectionRatio(comp, bb){
    if (!comp || !bb) return 0;
    var x1 = bb.x, y1 = bb.y, x2 = bb.x + bb.w, y2 = bb.y + bb.h;

    var ix1 = Math.max(0, x1);
    var iy1 = Math.max(0, y1);
    var ix2 = Math.min(comp.width,  x2);
    var iy2 = Math.min(comp.height, y2);

    var iw = Math.max(0, ix2 - ix1);
    var ih = Math.max(0, iy2 - iy1);
    var inter = iw * ih;
    var area = Math.max(1, bb.w * bb.h);

    return inter / area;
  }

  /** Overlap area of two comp-space bboxes. */
  function bboxOverlapArea(bb1, bb2) {
    if (!bb1 || !bb2) return 0;
    var x1 = Math.max(bb1.x, bb2.x);
    var y1 = Math.max(bb1.y, bb2.y);
    var x2 = Math.min(bb1.x + bb1.w, bb2.x + bb2.w);
    var y2 = Math.min(bb1.y + bb1.h, bb2.y + bb2.h);
    if (x2 <= x1 || y2 <= y1) return 0;
    return (x2 - x1) * (y2 - y1);
  }

  /** Ratio of bboxA's area that lies inside bboxB (0–1). Used for "text inside matte" check. */
  function intersectionRatioRects(bboxA, bboxB) {
    if (!bboxA || !bboxB || bboxA.w < 1 || bboxA.h < 1) return 0;
    var iw = Math.max(0, Math.min(bboxA.x + bboxA.w, bboxB.x + bboxB.w) - Math.max(bboxA.x, bboxB.x));
    var ih = Math.max(0, Math.min(bboxA.y + bboxA.h, bboxB.y + bboxB.h) - Math.max(bboxA.y, bboxB.y));
    var inter = iw * ih;
    var area = bboxA.w * bboxA.h;
    return area > 0 ? inter / area : 0;
  }

  /** Matte layer is the layer directly above (index - 1). NO_TRACK_MATTE = 1 in AE. */
  function getMatteLayerAbove(layer, comp) {
    try {
      if (!layer || !comp || layer.index <= 1) return null;
      var tt = layer.trackMatteType;
      if (tt == null || tt === 1) return null;
      if (typeof TrackMatteType !== "undefined" && tt === TrackMatteType.NO_TRACK_MATTE) return null;
      return comp.layer(layer.index - 1);
    } catch (e) { return null; }
  }

  /** True if layer has no track matte, or its bbox at t is sufficiently inside the matte layer's bbox. */
  function textVisibleInsideTrackMatte(layer, comp, t) {
    var matte = getMatteLayerAbove(layer, comp);
    if (!matte) return true;
    try {
      var textInfo = bboxForLayer(layer, comp, t);
      var matteBbox = getMatteBboxAtTime(matte, comp, t);
      if (!textInfo || !textInfo.bbox || !matteBbox) return false;
      return intersectionRatioRects(textInfo.bbox, matteBbox) >= MIN_IN_RATIO;
    } catch (e) { return false; }
  }

  /** Ratio of text bbox inside matte at t (0–1). Returns 1 if no track matte, so scoring is unchanged. */
  function getMatteRatioAt(layer, comp, t) {
    var matte = getMatteLayerAbove(layer, comp);
    if (!matte) return 1;
    try {
      var textInfo = bboxForLayer(layer, comp, t);
      var matteBbox = getMatteBboxAtTime(matte, comp, t);
      if (!textInfo || !textInfo.bbox || !matteBbox) return 0;
      return intersectionRatioRects(textInfo.bbox, matteBbox);
    } catch (e) { return 0; }
  }

  /** Matte layer bbox at t: use mask bounds when the matte has masks (e.g. solid+mask small box), else layer source rect (no tighten). */
  function getMatteBboxAtTime(matte, comp, t) {
    try {
      if (matte.mask && matte.mask.numProperties && matte.mask.numProperties > 0) {
        var maskBounds = getMaskShapeBoundsAtTime(matte, t);
        if (maskBounds) return maskBounds;
      }
      var bb = bboxFromSourceRectNoTighten(matte, t);
      if (bb) return bb;
      var info = bboxForLayer(matte, comp, t);
      return (info && info.bbox) ? info.bbox : null;
    } catch (e) { return null; }
  }

  /** Source rect in comp space without BBOX_TIGHTEN (for matte layer so we get full shape bounds). */
  function bboxFromSourceRectNoTighten(layer, t) {
    try {
      var r = null;
      try { r = layer.sourceRectAtTime(t, false); } catch (e0) { r = null; }
      if (!r || r.width <= 0.1 || r.height <= 0.1) { try { r = layer.sourceRectAtTime(t, true); } catch (e1) { r = null; } }
      if (!r || r.width <= 0.1 || r.height <= 0.1) return null;
      var x1 = r.left, y1 = r.top, x2 = r.left + r.width, y2 = r.top + r.height;
      var offset = getEffectPositionOffsetAtTime(layer, t);
      if (offset && offset.length >= 2) {
        x1 += Number(offset[0]); y1 += Number(offset[1]);
        x2 += Number(offset[0]); y2 += Number(offset[1]);
      }
      var p1 = layerPointToCompAtTime(layer, [x1, y1], t);
      var p2 = layerPointToCompAtTime(layer, [x2, y1], t);
      var p3 = layerPointToCompAtTime(layer, [x1, y2], t);
      var p4 = layerPointToCompAtTime(layer, [x2, y2], t);
      if (!p1 || !p2 || !p3 || !p4) return null;
      var minX = Math.min(p1[0], p2[0], p3[0], p4[0]);
      var maxX = Math.max(p1[0], p2[0], p3[0], p4[0]);
      var minY = Math.min(p1[1], p2[1], p3[1], p4[1]);
      var maxY = Math.max(p1[1], p2[1], p3[1], p4[1]);
      var w = maxX - minX, h = maxY - minY;
      if (w < 0.1 || h < 0.1) return null;
      return { x: minX, y: minY, w: w, h: h };
    } catch (e) { return null; }
  }

  /** Bbox of the first mask's shape at t in comp space. Tries layer.mask(1).maskPath then ADBE Mask Parade. */
  function getMaskShapeBoundsAtTime(layer, t) {
    try {
      var shapeProp = null;
      if (layer.mask && layer.mask.numProperties >= 1) {
        var firstMask = layer.mask(1);
        if (firstMask) {
          if (firstMask.maskPath) shapeProp = firstMask.maskPath;
          else if (firstMask.property("ADBE Mask Shape")) shapeProp = firstMask.property("ADBE Mask Shape");
        }
      }
      if (!shapeProp && layer.property("ADBE Mask Parade")) {
        var maskGroup = layer.property("ADBE Mask Parade");
        if (maskGroup.numProperties >= 1) {
          var maskAtom = maskGroup.property(1);
          if (maskAtom) shapeProp = maskAtom.property("ADBE Mask Shape");
        }
      }
      if (!shapeProp) return null;
      var shape = shapeProp.valueAtTime(t, false);
      if (!shape) return null;
      var verts = shape.vertices;
      var n = (verts && verts.length != null && typeof verts.length === "number") ? verts.length : 0;
      if (n < 2) return null;
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (var i = 0; i < n; i++) {
        var v = verts[i];
        if (!v) continue;
        var x = (v[0] !== undefined) ? Number(v[0]) : (v.x != null ? Number(v.x) : NaN);
        var y = (v[1] !== undefined) ? Number(v[1]) : (v.y != null ? Number(v.y) : NaN);
        if (!isFinite(x) || !isFinite(y)) continue;
        var pt = layerPointToCompAtTime(layer, [x, y], t);
        if (pt && pt.length >= 2) {
          if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
        }
      }
      if (minX > maxX || minY > maxY) return null;
      return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
    } catch (e) { return null; }
  }

  /**
   * For track-matte layers: the visible "comp" is the matte. Returns the bbox to use as the composition bounds for visibility/scoring.
   * - No track matte: comp bounds { x:0, y:0, w: comp.width, h: comp.height }.
   * - Track matte: matte layer's bbox at t (the small box). Scan then treats the masked layer as if the comp size were the matte size.
   */
  function getEffectiveBoundsForLayerAtTime(layer, comp, t) {
    try {
      var matte = getMatteLayerAbove(layer, comp);
      if (matte) {
        var matteBbox = getMatteBboxAtTime(matte, comp, t);
        if (matteBbox && matteBbox.w >= 2 && matteBbox.h >= 2) return matteBbox;
      }
      return { x: 0, y: 0, w: comp.width || 1920, h: comp.height || 1080 };
    } catch (e) { return { x: 0, y: 0, w: comp.width || 1920, h: comp.height || 1080 }; }
  }

  /** True if at time t any non-text layer above (lower index) largely covers the text bbox. */
  function isCoveredByLayerDirectlyAbove(textLayer, comp, t, textBbox) {
    try {
      var textIdx = textLayer.index;
      if (textIdx <= 1) return false;
      var textArea = Math.max(1, textBbox.w * textBbox.h);
      for (var i = 1; i < textIdx; i++) {
        var L = comp.layer(i);
        if (!L || !L.enabled) continue;
        // Duplicated text stacks above the source layer — each string still needs its own screenshot.
        if (L.matchName === "ADBE Text Layer") continue;
        if (t < L.inPoint || t > L.outPoint) continue;
        if (layerOpacityAt(L, t) < 25) continue;
        var aboveBb = bboxFromSourceRect(L, t);
        if (!aboveBb || aboveBb.w < 2 || aboveBb.h < 2) {
          aboveBb = { x: 0, y: 0, w: comp.width || 1920, h: comp.height || 1080 };
        }
        var overlap = bboxOverlapArea(textBbox, aboveBb);
        if (overlap >= 0.5 * textArea) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  function textLenAt(layer, t){
    try{
      var sp = getSourceTextProp(layer);
      if (!sp) return 0;
      var doc = sp.valueAtTime(t, false);
      return String(doc.text || "").length;
    }catch(e){ return 0; }
  }

  /** Width of visible text at time t (sourceRectAtTime). Used to detect full reveal for simple/path-trim typewriter. */
  function sourceRectWidthAt(layer, t) {
    try {
      var r = null;
      try { r = layer.sourceRectAtTime(t, false); } catch (e0) { r = null; }
      if (!r || r.width <= 0) try { r = layer.sourceRectAtTime(t, true); } catch (e1) { r = null; }
      return (r && r.width > 0) ? r.width : 0;
    } catch (e) { return 0; }
  }

  /** For simple typewriter (path trim): text length is constant but visible portion grows. Returns time when rect width is max, or null. */
  function getTimeOfFullVisualReveal(layer, comp) {
    try {
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < 0.01) return null;
      var step = comp.frameDuration || (1 / 24);
      if (!isFinite(step) || step <= 0) step = 1 / 24;
      var bestT = a;
      var maxW = 0;
      for (var t = a; t <= b; t += step) {
        if (!layerEligible(layer, t)) continue;
        var w = sourceRectWidthAt(layer, t);
        if (w > maxW) { maxW = w; bestT = t; }
      }
      return (maxW > 0) ? { t: bestT, maxW: maxW } : null;
    } catch (e) { return null; }
  }

  /** For constant-length typewriter: prefer time in last portion of layer (preset often reveals by end). Returns time >= start of "tail". */
  var TYPEWRITER_TAIL_RATIO = 0.70;
  /** For animator+range-selector typewriter (rect doesn't grow): use later tail so we're in the fully-revealed portion. */
  var TYPEWRITER_TAIL_RATIO_ANIMATOR = 0.90;
  function getMinTimeInTypewriterTail(layer, forAnimatorTypewriter) {
    try {
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < 0.05) return a;
      var ratio = (forAnimatorTypewriter === true) ? TYPEWRITER_TAIL_RATIO_ANIMATOR : TYPEWRITER_TAIL_RATIO;
      return a + (b - a) * ratio;
    } catch (e) { return 0; }
  }

  /** True if source rect width grows over the layer (real typewriter reveal). Plain text has constant rect. */
  function rectWidthGrowsOverDuration(layer, comp) {
    try {
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < 0.05) return false;
      var step = comp.frameDuration || (1 / 24);
      if (!isFinite(step) || step <= 0) step = 1 / 24;
      var minW = 1e9;
      var maxW = 0;
      for (var t = a; t <= b; t += step) {
        if (!layerEligible(layer, t)) continue;
        var w = sourceRectWidthAt(layer, t);
        if (w > 0) { if (w < minW) minW = w; if (w > maxW) maxW = w; }
      }
      return (minW > 0 && minW < 1e8 && maxW >= minW * 1.15);
    } catch (e) { return false; }
  }

  /** True if text length is constant over the layer (simple/path-trim typewriter). */
  function isConstantLengthTypewriter(layer, comp, maxLen) {
    if (!maxLen || maxLen < 2) return false;
    try {
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < 0.01) return false;
      var samples = [a, a + (b - a) * 0.25, a + (b - a) * 0.5, a + (b - a) * 0.75, b];
      for (var i = 0; i < samples.length; i++) {
        var t = samples[i];
        if (t > b) continue;
        if (textLenAt(layer, t) !== maxLen) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  /** Animator + range selector typewriter: constant length but sourceRect does not grow (AE reports full text bounds). Prefer end of layer and only 1 stable frame. */
  function isAnimatorTypewriter(layer, comp, maxLen) {
    if (!maxLen || maxLen < 2) return false;
    try {
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < 0.5) return false;
      return isConstantLengthTypewriter(layer, comp, maxLen) && !rectWidthGrowsOverDuration(layer, comp);
    } catch (e) { return false; }
  }

  /**
   * First time in [inPoint, outPoint] when ANY text animator RANGE SELECTOR's Start reaches 100%.
   * This follows the AE UI directly (the Range Selector "Start" slider) instead of trying to infer
   * coverage. Works regardless of animator name/preset and for any number of animators/selectors.
   * Returns null if no selector has a Start property or it never reaches ~100 in the scan window.
   */
  function getTimeWhenRangeSelectorStartAt100(layer, comp, maxLen) {
    try {
      if (!layer || layer.matchName !== "ADBE Text Layer") return null;
      var tp = layer.property("ADBE Text Properties");
      if (!tp) return null;
      var animatorsGroup = tp.property("ADBE Text Animators");
      if (!animatorsGroup || animatorsGroup.numProperties < 1) return null;

      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      var step = comp.frameDuration || (1 / 24);
      if (!isFinite(step) || step <= 0) step = 1 / 24;
      if (b - a < step) return null;

      function numVal(prop, t) {
        if (!prop) return NaN;
        try {
          var v = prop.valueAtTime(t, false);
          if (v != null && typeof v === "number" && isFinite(v)) return v;
          if (v && typeof v.length === "number" && v.length > 0) return Number(v[0]);
          v = prop.valueAtTime(t, true);
          if (v != null && typeof v === "number" && isFinite(v)) return v;
          if (v && typeof v.length === "number" && v.length > 0) return Number(v[0]);
        } catch (e) {}
        return NaN;
      }

      // Earliest moment when Start is ~100. Prefer the SECOND keyframe of the selector's Start
      // (common AE pattern: key1=0, key2=100) and fall back to other keyframes / sampling with
      // a short "hold" period if that is not usable. Keyframes may be on the main property or on a dimension (X/Y).
      function propWithKeys(prop) {
        if (!prop) return null;
        if (prop.numKeys != null && prop.numKeys >= 2) return prop;
        if (prop.numProperties != null) {
          for (var d = 1; d <= Math.min(prop.numProperties, 5); d++) {
            try {
              var sub = prop.property(d);
              if (sub && sub.numKeys != null && sub.numKeys >= 2) return sub;
            } catch (ed) {}
          }
        }
        return prop;
      }
      function stableStartAt100Time(startProp, a, b, baseStep) {
        if (!startProp) return null;
        var keyProp = propWithKeys(startProp);
        var maxSamples = 80;
        var span = b - a;
        if (span <= 0) return null;
        var stepLocal = baseStep;
        if (!isFinite(stepLocal) || stepLocal <= 0) stepLocal = 1 / 24;
        if (span / stepLocal > maxSamples) stepLocal = span / maxSamples;

        var threshold = 99;
        var holdThreshold = 90;
        var minHold = Math.max(stepLocal * 2, 0.05); // tiny pause at ~100%

        // 1) Hard preference: if the SECOND keyframe of Start is ~100 within [a,b], use it.
        try {
          if (keyProp.numKeys && keyProp.numKeys >= 2) {
            var kt2 = keyProp.keyTime(2);
            if (kt2 >= a - 0.001 && kt2 <= b + 0.001) {
              var kv2;
              try { kv2 = keyProp.keyValue(2); } catch (eKV2) { kv2 = numVal(startProp, kt2); }
              if (isFinite(kv2) && kv2 >= threshold) return kt2;
            }
          }
        } catch (eSecond) {}

        // 2) General keyframe-first path: any key in [a,b] that is ~100 and stays high for a bit.
        try {
          if (keyProp.numKeys && keyProp.numKeys >= 2) {
            for (var ki = 1; ki <= keyProp.numKeys; ki++) {
              var kt = keyProp.keyTime(ki);
              if (kt < a - 0.001 || kt > b + 0.001) continue;
              var kv;
              try { kv = keyProp.keyValue(ki); } catch (eKV) { kv = numVal(startProp, kt); }
              if (!isFinite(kv) || kv < threshold) continue;

              // If there is a following key, ensure we stay high at least halfway to it.
              var tEndHold = null;
              if (ki < keyProp.numKeys) {
                var ktNext = keyProp.keyTime(ki + 1);
                tEndHold = Math.min(b, kt + Math.max(minHold, (ktNext - kt) * 0.5));
              } else {
                tEndHold = Math.min(b, kt + minHold);
              }

              var okKF = true;
              for (var tfKF = kt; tfKF <= tEndHold + 0.0001; tfKF += stepLocal) {
                var vfKF = numVal(startProp, tfKF);
                if (!isFinite(vfKF) || vfKF < holdThreshold) { okKF = false; break; }
              }
              if (okKF) return kt;
            }
          }
        } catch (eKF) {}

        // 3) Fallback sampling path if keyframes are not available or inconclusive.
        var t;
        for (t = a; t <= b + 0.0001; t += stepLocal) {
          var v = numVal(startProp, t);
          if (!isFinite(v) || v < threshold) continue;

          var tEnd = Math.min(b, t + minHold);
          var ok = true;
          var tf;
          for (tf = t; tf <= tEnd + 0.0001; tf += stepLocal) {
            var vf = numVal(startProp, tf);
            if (!isFinite(vf) || vf < holdThreshold) { ok = false; break; }
          }
          if (ok) return t;
        }
        return null;
      }

      var bestT = null;
      var ai, animator, selectorsGroup, si, selector, startProp;
      for (ai = 1; ai <= animatorsGroup.numProperties; ai++) {
        animator = animatorsGroup.property(ai);
        if (!animator) continue;
        selectorsGroup = animator.property("ADBE Text Selectors");
        if (!selectorsGroup || selectorsGroup.numProperties < 1) continue;

        for (si = 1; si <= selectorsGroup.numProperties; si++) {
          selector = selectorsGroup.property(si);
          if (!selector) continue;
          startProp = null;
          try { startProp = selector.property("ADBE Text Percent Start"); } catch (eSP) {}
          if (!startProp) continue;
          var tSel = stableStartAt100Time(startProp, a, b, step);
          if (tSel != null && (bestT == null || tSel < bestT)) bestT = tSel;
        }
      }
      return bestT;
    } catch (eOuter) {
      return null;
    }
  }

  /** Find a property on a range selector by display name or matchName. */
  function findSelectorProp(selector, nameHint) {
    if (!selector) return null;
    var hint = String(nameHint || "").toLowerCase();
    try {
      var direct = selector.property("ADBE Text Percent " + nameHint);
      if (direct) return direct;
    } catch (e0) {}
    try {
      var n = selector.numProperties || 0;
      for (var i = 1; i <= n; i++) {
        var p = null;
        try { p = selector.property(i); } catch (e1) {}
        if (!p) continue;
        var nm = "";
        try { nm = String(p.name || ""); } catch (e2) {}
        if (nm.toLowerCase() === hint) return p;
      }
    } catch (e3) {}
    return null;
  }

  /**
   * Text animator typewriter (Range Selector Offset/Start): screenshot at reveal, not earliest keyTime(2) on Transform.
   * Prefers Offset keyTime(2) (latest on timeline); else Start at ~100% (second keyframe or stable hold).
   */
  function getTimeWhenRangeSelectorAnimatorReveal(layer, a, b) {
    try {
      if (!layer || layer.matchName !== "ADBE Text Layer") return null;
      var tp = layer.property("ADBE Text Properties");
      if (!tp) return null;
      var animatorsGroup = tp.property("ADBE Text Animators");
      if (!animatorsGroup || animatorsGroup.numProperties < 1) return null;
      var aNum = Number(a);
      var bNum = Number(b);
      if (!isFinite(aNum) || !isFinite(bNum)) return null;

      function keyTime2InRange(prop) {
        if (!prop) return null;
        try {
          if (prop.numKeys != null && prop.numKeys >= 2) {
            var kt = prop.keyTime(2);
            if (kt != null && isFinite(kt) && kt >= aNum - 0.001 && kt <= bNum + 0.001) return kt;
          }
        } catch (eK) {}
        return null;
      }

      var offsetTimes = [];
      var ai, animator, selectorsGroup, si, selector, offsetProp, ktOff;
      for (ai = 1; ai <= animatorsGroup.numProperties; ai++) {
        animator = animatorsGroup.property(ai);
        if (!animator) continue;
        selectorsGroup = animator.property("ADBE Text Selectors");
        if (!selectorsGroup || selectorsGroup.numProperties < 1) continue;
        for (si = 1; si <= selectorsGroup.numProperties; si++) {
          selector = selectorsGroup.property(si);
          if (!selector) continue;
          offsetProp = findSelectorProp(selector, "Offset");
          ktOff = keyTime2InRange(offsetProp);
          if (ktOff != null) offsetTimes[offsetTimes.length] = ktOff;
        }
      }
      if (offsetTimes.length > 0) {
        var latest = offsetTimes[0];
        for (var oi = 1; oi < offsetTimes.length; oi++) {
          if (offsetTimes[oi] > latest) latest = offsetTimes[oi];
        }
        return latest;
      }

      var comp = null;
      try { comp = layer.comp; } catch (eC) {}
      if (comp) {
        var maxLen = 0;
        try { maxLen = String(getCompletedTextForLayer(layer, comp) || "").length; } catch (eL) {}
        if (maxLen < 1) maxLen = 100;
        var tStart = getTimeWhenRangeSelectorStartAt100(layer, comp, maxLen);
        if (tStart != null && isFinite(tStart) && tStart >= aNum - 0.001 && tStart <= bNum + 0.001) return tStart;
      }
      return null;
    } catch (eOuter) {
      return null;
    }
  }

  /** First time when a "Typewriter" (or similar) layer EFFECT reaches full reveal. Effects live under ADBE Effect Parade; can be in groups (e.g. "Animate In" > "Typewriter"). Scans effect params for 0-100 or 0-1 sliders. */
  function getTimeWhenEffectTypewriterAt100(layer, comp) {
    try {
      if (!layer) return null;
      var step = comp.frameDuration || (1 / 24);
      if (!isFinite(step) || step <= 0) step = 1 / 24;
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < step) return null;
      var debugLog = (typeof DEBUG_TYPEWRITER_LOG !== "undefined" && DEBUG_TYPEWRITER_LOG) ? [] : null;
      var compName = (comp && comp.name != null) ? String(comp.name) : "";
      if (debugLog) debugLog.push("--- Layer: '" + (layer.name || "") + "' (comp: " + compName + ") ---");

      function effectNumVal(prop, t) {
        if (!prop) return NaN;
        try {
          var v = prop.valueAtTime(t, false);
          if (v != null && typeof v === "number" && isFinite(v)) return v;
          if (v && typeof v.length === "number" && v.length > 0) return Number(v[0]);
          v = prop.valueAtTime(t, true);
          if (v != null && typeof v === "number" && isFinite(v)) return v;
          if (v && typeof v.length === "number" && v.length > 0) return Number(v[0]);
          try { v = prop.value; if (v != null && typeof v === "number" && isFinite(v)) return v; if (v && v.length && v.length > 0) return Number(v[0]); } catch (e) {}
          return NaN;
        } catch (e) { return NaN; }
      }
      function firstTimeParamAtOrAbove(prop, a, b, step, threshold) {
        if (!prop) return null;
        function fromPropKeyframes(keyProp, valueProp) {
          if (!keyProp) return null;
          var p = valueProp || keyProp;
          try {
            if (keyProp.numKeys && keyProp.numKeys > 0) {
              for (var ki = 1; ki <= keyProp.numKeys; ki++) {
                var kt = keyProp.keyTime(ki);
                if (kt >= a - 0.001 && kt <= b + 0.001) {
                  var v = effectNumVal(p, kt);
                  if (isFinite(v) && (v >= threshold || (threshold >= 98 && v >= 0.98 && v <= 1.02))) return kt;
                }
              }
            }
          } catch (e) {}
          return null;
        }
        var tFromMain = fromPropKeyframes(prop, prop);
        if (tFromMain != null) {
          if (prop.numProperties != null && prop.numProperties >= 1) {
            for (var d = 1; d <= Math.min(prop.numProperties, 5); d++) {
              try {
                var sub = prop.property(d);
                var tSub = fromPropKeyframes(sub, prop);
                if (tSub != null && tSub < tFromMain) tFromMain = tSub;
              } catch (ed) {}
            }
          }
          return tFromMain;
        }
        if (prop.numProperties != null && prop.numProperties >= 1) {
          for (var d = 1; d <= Math.min(prop.numProperties, 5); d++) {
            try {
              var sub = prop.property(d);
              var tSub = fromPropKeyframes(sub, prop);
              if (tSub != null) return tSub;
            } catch (ed) {}
          }
        }
        for (var t = a; t <= b; t += step) {
          var v = effectNumVal(prop, t);
          if (isFinite(v) && (v >= threshold || (threshold >= 98 && v >= 0.98 && v <= 1.02))) return t;
        }
        return null;
      }
      function scanEffectParams(effectObj, effectName) {
        if (!effectObj) return;
        var n = 0;
        try { n = effectObj.numProperties; } catch (e) {}
        if (n == null || n < 1) return;
        try {
          for (var j = 1; j <= n; j++) {
            var param = null;
            try { param = effectObj.property(j); } catch (e1) {}
            if (!param) try { param = effectObj.param(j); } catch (e2) {}
            if (!param) continue;
            var nsub = 0;
            try { nsub = param.numProperties; } catch (e) {}
            if (nsub != null && nsub > 0) {
              scanEffectParams(param, (param.name || "").toString());
              continue;
            }
            var pname = (param.name || "").toString();
            // Blinking Cursor "Animation" effect: only the main Slider controls reveal; ignore Effect Opacity / GPU Rendering so we capture when text is fully revealed (e.g. Slider=9.961 not Opacity=8.880).
            if (effectName === "Animation" && pname !== "Slider" && pname !== "Animation") continue;
            var t98 = firstTimeParamAtOrAbove(param, a, b, step, 98);
            if (t98 != null) {
              if (bestT == null || t98 < bestT) bestT = t98;
              if (debugLog) debugLog.push("  param[" + j + "] '" + pname + "' => t=" + t98.toFixed(3));
            }
            var t098 = firstTimeParamAtOrAbove(param, a, b, step, 0.98);
            if (t098 != null && (bestT == null || t098 < bestT)) bestT = t098;
          }
        } catch (e) { if (debugLog) debugLog.push("  scanEffectParams err: " + e.toString()); }
      }

      var bestT = null;

      try {
        var effDirect = layer.effect("Typewriter");
        if (effDirect && effDirect.numProperties != null) {
          if (debugLog) debugLog.push("layer '" + (layer.name || "") + "': found effect('Typewriter')");
          scanEffectParams(effDirect, "Typewriter");
        }
      } catch (e) {}

      try {
        var animIn = layer.effect("Animate In");
        if (animIn && animIn.numProperties != null) {
          if (debugLog) debugLog.push("layer '" + (layer.name || "") + "': found effect('Animate In'), numProperties=" + animIn.numProperties);
          scanEffectParams(animIn, "Animate In");
          for (var k = 1; k <= animIn.numProperties; k++) {
            var sub = animIn.property(k);
            if (!sub) continue;
            var subName = (sub.name || "").toString();
            if (subName.indexOf("Typewriter") >= 0 && sub.numProperties != null) {
              if (debugLog) debugLog.push("  sub '" + subName + "' (Typewriter-like)");
              scanEffectParams(sub, subName);
            }
          }
        }
      } catch (e) {}

      try {
        var animEffect = layer.effect("Animation");
        if (animEffect && animEffect.numProperties != null && animEffect.numProperties > 0) {
          if (debugLog) debugLog.push("layer '" + (layer.name || "") + "': found effect('Animation')");
          scanEffectParams(animEffect, "Animation");
        }
      } catch (e) {}

      if (bestT == null && debugLog) {
        for (var ei = 1; ei <= 30; ei++) {
          try {
            var effByIndex = layer.effect(ei);
            if (!effByIndex) continue;
            var ename = (effByIndex.name || "").toString();
            var nprop = (effByIndex.numProperties != null) ? effByIndex.numProperties : 0;
            debugLog.push("layer.effect(" + ei + ") = '" + ename + "' numProperties=" + nprop);
            var isTypewriterLike = (ename.indexOf("Typewriter") >= 0 || ename.indexOf("Animate In") >= 0 || ename.indexOf("Animate") >= 0 || ename === "Animation");
            if (isTypewriterLike && nprop > 0) {
              scanEffectParams(effByIndex, ename);
            }
            if (nprop > 0 && ename.indexOf("Typewriter") < 0 && (ename.indexOf("Animate") >= 0 || ename === "Animation")) {
              for (var sk = 1; sk <= nprop; sk++) {
                try {
                  var subEff = effByIndex.property(sk);
                  if (!subEff) continue;
                  var subName = (subEff.name || "").toString();
                  if (subName.indexOf("Typewriter") >= 0 && subEff.numProperties != null) {
                    debugLog.push("  -> sub '" + subName + "'");
                    scanEffectParams(subEff, subName);
                  }
                } catch (e3) {}
              }
            }
          } catch (e2) {}
        }
      }

      var effectsGroup = layer.property("ADBE Effect Parade");
      if (effectsGroup && effectsGroup.numProperties) {
        function scanEffectOrGroup(grp) {
          if (!grp || !grp.numProperties) return;
          try {
            for (var i = 1; i <= grp.numProperties; i++) {
              var p = grp.property(i);
              if (!p) continue;
              var name = (p.name || "").toString();
              var matchName = (p.matchName || "").toString();
              var isTypewriterLike = (name.indexOf("Typewriter") >= 0 || name.indexOf("Type writer") >= 0 || matchName.indexOf("Typewriter") >= 0);
              var isAnimateIn = (name.indexOf("Animate In") >= 0 || name.indexOf("Animate") >= 0);
              if (p.numProperties != null && p.numProperties > 0) {
                if (isTypewriterLike) {
                  if (debugLog) debugLog.push("layer '" + (layer.name || "") + "': parade group '" + name + "' (Typewriter-like)");
                  scanEffectParams(p, name);
                } else if (isAnimateIn || name.length > 0) {
                  scanEffectOrGroup(p);
                } else {
                  scanEffectOrGroup(p);
                }
              }
            }
          } catch (e) {}
        }
        scanEffectOrGroup(effectsGroup);
      } else if (debugLog) {
        var ep = layer.property("ADBE Effect Parade");
        debugLog.push("layer '" + (layer.name || "") + "': no ADBE Effect Parade or empty (effectsGroup=" + (ep ? "exists" : "null") + (ep && ep.numProperties != null ? ", numProperties=" + ep.numProperties : "") + ")");
      }

      if (debugLog && debugLog.length > 0) {
        debugLog.push("=> getTimeWhenEffectTypewriterAt100 result: " + (bestT != null ? bestT.toFixed(3) : "null"));
        try {
          var f = new File(Folder.myDocuments.fsName + "/Crowdin_typewriter_debug.txt");
          f.open("a");
          f.write(debugLog.join("\n") + "\n");
          f.close();
        } catch (ex) {}
      }
      return bestT;
    } catch (e) { return null; }
  }

  /** First time when typewriter is at full reveal: from text animator range selector OR from Typewriter (effect). */
  function getTimeWhenTypewriterFullReveal(layer, comp, maxLen) {
    var tAnim = getTimeWhenRangeSelectorStartAt100(layer, comp, maxLen);
    var tEffect = getTimeWhenEffectTypewriterAt100(layer, comp);
    // Blinking Cursor: prefer effect Slider time (full reveal) so we never modify the effect and sourceRect at t is correct.
    if (hasBlinkingCursorTypewriterEffect(layer) && tEffect != null) return tEffect;
    if (tEffect != null && (tAnim == null || tEffect < tAnim)) return tEffect;
    return tAnim;
  }

  /** Return the completed/full text for Crowdin (e.g. after typewriter or without blinking cursor). Samples layer duration and returns text at a time when length is max. */
  function getCompletedTextForLayer(layer, comp) {
    try {
      var sp = getSourceTextProp(layer);
      if (!sp) return "";
      var a = Math.max(0, Number(layer.inPoint || 0));
      var b = Math.max(a, Number(layer.outPoint || 0));
      if (b - a < 0.01) return trim(String(sp.value.text || ""));
      var step = comp.frameDuration || (1/24);
      if (!isFinite(step) || step <= 0) step = 1/24;
      var maxLen = 0;
      var bestT = a;
      for (var t = a; t <= b; t += step) {
        if (!layerEligible(layer, t)) continue;
        var len = textLenAt(layer, t);
        if (len > maxLen) { maxLen = len; bestT = t; }
      }
      var doc = sp.valueAtTime(bestT, false);
      var txt = trim(String(doc.text || ""));
      txt = stripBlinkingCursorCursor(txt);
      txt = txt.replace(/\s+$/, "").replace(/^\s+/, "");
      return normalizeTextForTmsExport(trim(txt));
    } catch (e) { return ""; }
  }

  function exportCompPngAtTime(comp, t, outFile, resolutionAlreadySet){
    var oldRes = null;
    try{
      if (!/\.png$/i.test(outFile.fsName)) outFile = new File(outFile.fsName + ".png");
      try { if (outFile.exists) outFile.remove(); } catch(e0){}

      try { app.project.activeItem = comp; } catch(eActive){}
      try { comp.time = t; } catch(e2){}

      if (!resolutionAlreadySet) {
        try { oldRes = comp.resolutionFactor; } catch(eOld){}
        if (SCREENSHOT_RES_FACTOR && SCREENSHOT_RES_FACTOR > 1) {
          try { comp.resolutionFactor = [SCREENSHOT_RES_FACTOR, SCREENSHOT_RES_FACTOR]; } catch(eRF){}
        }
      }
      // When resolutionAlreadySet is true, smartScanTimeline already set comp.resolutionFactor (e.g. Quarter for Phrase).

      if (typeof SKIP_REFRESH_EVERY_FRAME === "undefined" || !SKIP_REFRESH_EVERY_FRAME) {
        try { app.refresh(); } catch(e3){}
      }

      // Give AE time to update comp to time t before capture (saveFrameToPng can be async and may use current comp state).
      try { $.sleep(150); } catch (eSleep) {}

      comp.saveFrameToPng(t, outFile);

      var tries = 0;
      while (!outFile.exists && tries < 60) { $.sleep(50); tries++; }
      return outFile.exists;
    }catch(e){
      return false;
    } finally {
      if (!resolutionAlreadySet && oldRes && oldRes.length === 2) {
        try { comp.resolutionFactor = oldRes; } catch(eBack){}
      }
    }
  }

  /** Main-comp screenshot at a specific comp time (snapshot or keyframe). */
  function buildMainCompScreenshotAtTime(layer, comp, t, sourceTag) {
    if (t == null || !isFinite(t)) return null;
    try {
      var info = bboxForLayer(layer, comp, t);
      var bb = info ? info.bbox : null;
      if (!bb || bb.w < 1 || bb.h < 1) bb = bboxFromPositionRescue(layer, comp, t);
      if (!bb || bb.w < 1 || bb.h < 1) {
        bb = { x: 0, y: 0, w: Math.max(2, comp.width || 100), h: Math.max(2, comp.height || 50) };
      }
      return { t: t, bbox: bb, source: sourceTag || "screenshot-time" };
    } catch (e) {}
    return null;
  }

  /** Last resort: preferred times without “covered by layer above” (duplicate text stacks). */
  function tryMainCompScreenshotForced(layer, comp) {
    if (!layer || !comp || layer.matchName !== "ADBE Text Layer") return null;
    var keySearch = getLayerKeyframeSearchRange(layer, comp);
    var tSnap = getSnapshotMarkerTime(layer);
    if (tSnap != null && isFinite(tSnap) && tSnap >= keySearch.start - 0.001 && tSnap <= keySearch.end + 0.001) {
      var snapF = buildMainCompScreenshotAtTime(layer, comp, tSnap, "snapshot-marker-forced");
      if (snapF) return snapF;
    }
    var prefsF = getPreferredScreenshotTimes(layer, keySearch.start, keySearch.end, true);
    if (prefsF && prefsF.length) {
      for (var pf = 0; pf < prefsF.length; pf++) {
        var hitF = buildMainCompScreenshotAtTime(layer, comp, prefsF[pf], "screenshot-forced");
        if (hitF) return hitF;
      }
    }
    var midF = (keySearch.start + keySearch.end) / 2;
    return buildMainCompScreenshotAtTime(layer, comp, midF, "screenshot-forced");
  }

  /** Main comp: Snapshot Marker wins, else preferred time (second keyframe), else full findBestTime. */
  function tryMainCompScreenshotFromRules(layer, comp) {
    if (!layer || !comp || layer.matchName !== "ADBE Text Layer") return null;
    var keySearch = getLayerKeyframeSearchRange(layer, comp);
    var tSnap = getSnapshotMarkerTime(layer);
    if (tSnap != null && isFinite(tSnap) && tSnap >= keySearch.start - 0.001 && tSnap <= keySearch.end + 0.001) {
      var snapHit = buildMainCompScreenshotAtTime(layer, comp, tSnap, "snapshot-marker");
      if (snapHit) return snapHit;
    }
    var prefs = getPreferredScreenshotTimes(layer, keySearch.start, keySearch.end, true);
    if (prefs && prefs.length > 0) {
      var kfHit = buildMainCompScreenshotAtTime(layer, comp, prefs[0], "screenshot-time");
      if (kfHit) return kfHit;
    }
    var best = findBestTime(layer, comp, { allowSnapshotMarker: true });
    if (best) return best;
    best = findBestTime(layer, comp, { allowSnapshotMarker: true, relaxed: true });
    if (best) return best;
    return tryMainCompScreenshotForced(layer, comp);
  }

  /** Always produce a screenshot candidate for this text layer (duplicate stacks, same text content). */
  function tryScreenshotForTextLayer(layer, layerComp, mainComp, precomputedMainTime) {
    if (!layer || layer.matchName !== "ADBE Text Layer") return null;
    var best = null;
    if (layerComp === mainComp) {
      best = tryMainCompScreenshotFromRules(layer, mainComp);
      if (!best) best = tryMainCompScreenshotForced(layer, mainComp);
    } else {
      best = tryNestedScreenshotFromPrecompTimes(layer, layerComp, mainComp, precomputedMainTime);
      if (!best) best = tryNestedScreenshotFromPrecompTimes(layer, layerComp, mainComp, null);
      if (!best) {
        var fallN = getFallbackTimeAndBbox(layer, layerComp, true);
        if (fallN) best = mapPrecompBboxToMainAtTime(layer, layerComp, mainComp, fallN.t, fallN.bbox, fallN.source);
      }
      if (!best) {
        var pathF = getPathToComp(mainComp, layerComp);
        var tMid = (Number(layer.inPoint || 0) + Number(layer.outPoint || 0)) / 2;
        var tMainF = findMainTimeForPrecompLocalTime(pathF, tMid, 0, mainComp.duration || 1, mainComp, layerComp);
        if (tMainF != null) best = buildNestedScreenshotAtMainTime(layer, layerComp, mainComp, tMainF, "screenshot-forced-nested");
      }
    }
    return best;
  }

  // ✅ Single rule: Snapshot Marker when present, else second keyframe or midpoint.
  function findBestTime(layer, comp, scanOpts){
    scanOpts = scanOpts || {};
    var allowSnapshotMarker = scanOpts.allowSnapshotMarker !== false;
    var relaxed = scanOpts.relaxed === true;
    try{
      var win = getCompScanWindow(comp);
      var winStart = win.start;
      var winEnd = win.end;
      var a = Math.max(winStart, Math.max(0, Number(layer.inPoint || 0)));
      var b = Math.min(winEnd, Math.max(a, Number(layer.outPoint || 0)));
      if ((b - a) < 0.01) {
        var layerIn = Math.max(0, Number(layer.inPoint || 0));
        var layerOut = Math.max(layerIn, Number(layer.outPoint || 0));
        var compDur = 0;
        try { compDur = Math.max(0, Number(comp.duration || 0)); } catch (e) {}
        if (compDur > 0 && layerIn < compDur && layerOut > 0 && (layerOut - layerIn) >= 0.01) {
          a = Math.max(0, layerIn);
          b = Math.min(compDur, layerOut);
        }
      }
      if ((b - a) < 0.01) return null;

      if (allowSnapshotMarker) {
        var keySearchFb = getLayerKeyframeSearchRange(layer, comp);
        var tSnap = getSnapshotMarkerTime(layer);
        if (tSnap != null && isFinite(tSnap) && tSnap >= keySearchFb.start - 0.001 && tSnap <= keySearchFb.end + 0.001) {
          var snapBest = buildMainCompScreenshotAtTime(layer, comp, tSnap, "snapshot-marker");
          if (snapBest) return snapBest;
        }
      }

      var rangeRevealBest = getTimeWhenRangeSelectorAnimatorReveal(layer, a, b);
      var t = getScreenshotTimeForLayer(layer, a, b, allowSnapshotMarker);
      if (!layerEligible(layer, t)) return null;
      var ref = getEffectiveBoundsForLayerAtTime(layer, comp, t);
      var info = bboxForLayer(layer, comp, t);
      var bb = info ? info.bbox : null;
      if (!bb) bb = bboxFromPositionRescue(layer, comp, t);
      if (!bb || !bboxIntersectsRect(bb, ref)) return null;
      var minRatio = relaxed ? FALLBACK_RATIO : MIN_IN_RATIO;
      if ((ref ? intersectionRatioRects(bb, ref) : 1) < minRatio) return null;
      if (!relaxed && isCoveredByLayerDirectlyAbove(layer, comp, t, bb)) return null;
      return { t: t, bbox: bb, source: (info && info.source) || "screenshot-time" };
    }catch(e){}
    return null;
  }

  // Last-resort: same single rule (second keyframe or midpoint), then ensure we return a valid bbox.
  function getFallbackTimeAndBbox(layer, comp, allowSnapshotMarker) {
    if (allowSnapshotMarker === undefined) allowSnapshotMarker = true;
    try {
      var win = getCompScanWindow(comp);
      var winStart = win.start;
      var winEnd = win.end;
      var a = Math.max(winStart, Math.max(0, Number(layer.inPoint || 0)));
      var b = Math.min(winEnd, Math.max(a, Number(layer.outPoint || 0)));
      if (b - a < 0.01) {
        a = winStart;
        b = winEnd;
      }
      var step = comp.frameDuration || (1/24);
      if (!isFinite(step) || step <= 0) step = 1/24;

      var t = getScreenshotTimeForLayer(layer, a, b, allowSnapshotMarker);
      for (var j = 0; j <= 10; j++) {
        var tTry = (j === 0) ? t : (t + (j % 2 === 1 ? 1 : -1) * Math.ceil(j / 2) * step);
        if (tTry < a) tTry = a;
        if (tTry > b) tTry = b;
        if (!layerEligible(layer, tTry)) continue;
        var refTry = getEffectiveBoundsForLayerAtTime(layer, comp, tTry);
        var info = bboxForLayer(layer, comp, tTry);
        if (info && info.bbox && bboxIntersectsRect(info.bbox, refTry) && intersectionRatioRects(info.bbox, refTry) >= FALLBACK_RATIO)
          return { t: tTry, bbox: info.bbox, source: info.source };
        var bbR = bboxFromPositionRescue(layer, comp, tTry);
        if (bbR && bboxIntersectsRect(bbR, refTry) && intersectionRatioRects(bbR, refTry) >= FALLBACK_RATIO)
          return { t: tTry, bbox: bbR, source: 'rescue' };
      }
      for (var k = 0; k <= 20; k++) {
        var tk = a + (b - a) * (k / 20);
        if (!layerEligible(layer, tk)) continue;
        var refK = getEffectiveBoundsForLayerAtTime(layer, comp, tk);
        var bb2 = bboxFromPositionRescue(layer, comp, tk);
        if (bb2 && bboxIntersectsRect(bb2, refK) && intersectionRatioRects(bb2, refK) >= FALLBACK_RATIO) return { t: tk, bbox: bb2, source: 'rescue' };
      }
      if (layerEligible(layer, a)) {
        var refA = getEffectiveBoundsForLayerAtTime(layer, comp, a);
        var bb3 = bboxFromPositionRescue(layer, comp, a);
        if (bb3 && bboxIntersectsRect(bb3, refA) && intersectionRatioRects(bb3, refA) >= FALLBACK_RATIO) return { t: a, bbox: bb3, source: 'rescue' };
        var cx = (refA.w * 0.5) + refA.x - 40;
        var cy = (refA.h * 0.5) + refA.y - 20;
        var cxClamp = Math.max(refA.x, Math.min(refA.x + refA.w - 80, cx));
        var cyClamp = Math.max(refA.y, Math.min(refA.y + refA.h - 40, cy));
        return { t: a, bbox: { x: cxClamp, y: cyClamp, w: 80, h: 40 }, source: 'rescue' };
      }
    } catch (e) {}
    return null;
  }

  /** When findBestTime and getFallbackTimeAndBbox both fail (e.g. simple typewriter at keyframe time has tiny bbox), use a time in the tail (90%+) so text is fully revealed and we still send a candidate for this layer. */
  function getRescueTailTimeAndBbox(layer, comp) {
    try {
      var win = getCompScanWindow(comp);
      var a = Math.max(win.start, Math.max(0, Number(layer.inPoint || 0)));
      var b = Math.min(win.end, Math.max(a, Number(layer.outPoint || 0)));
      if (b - a < 0.01) return null;
      var ratios = [0.9, 0.95, 1.0];
      for (var ri = 0; ri < ratios.length; ri++) {
        var t = a + (b - a) * ratios[ri];
        if (t > b) t = b;
        if (!layerEligible(layer, t)) continue;
        var ref = getEffectiveBoundsForLayerAtTime(layer, comp, t);
        var info = bboxForLayer(layer, comp, t);
        var bb = info ? info.bbox : null;
        if (!bb) bb = bboxFromPositionRescue(layer, comp, t);
        if (!bb || bb.w < 1 || bb.h < 1) continue;
        if (ref && !bboxIntersectsRect(bb, ref)) continue;
        return { t: t, bbox: bb, source: (info && info.source) || "rescue-tail" };
      }
    } catch (e) {}
    return null;
  }

  /** Find chain of layers from mainComp down to targetComp. Returns [{ layer, comp }, ...] where path[0].comp = mainComp, path[i].layer.source = path[i+1].comp, path[path.length-1].layer.source = targetComp. */
  function getPathToComp(mainComp, targetComp) {
    if (!mainComp || !targetComp || mainComp === targetComp) return [];
    var targetId = targetComp.id != null ? String(targetComp.id) : null;
    try {
      var layers = mainComp.layers;
      for (var i = 1; i <= layers.length; i++) {
        var L = layers[i];
        if (!L || !L.source) continue;
        var src = L.source;
        var match = (src === targetComp) || (targetId && src.id != null && String(src.id) === targetId);
        if (match) return [{ layer: L, comp: mainComp }];
        if (src instanceof CompItem) {
          var sub = getPathToComp(src, targetComp);
          if (sub.length) return [{ layer: L, comp: mainComp }].concat(sub);
        }
      }
    } catch (e) {}
    return [];
  }

  /** Stable layer id within a root comp tree (precomp chain via layer indices). Used to match duplicated comps on import. */
  function makeLayerStablePathKey(rootComp, layerComp, layer) {
    if (!rootComp || !layer) return "";
    if (layerComp === rootComp) return "L" + layer.index;
    var path = getPathToComp(rootComp, layerComp);
    if (!path || !path.length) return "comp_" + (layerComp && layerComp.id != null ? layerComp.id : "?") + "__L" + layer.index;
    var parts = [];
    for (var p = 0; p < path.length; p++) parts.push("P" + path[p].layer.index);
    parts.push("L" + layer.index);
    return parts.join("/");
  }

  /** Cache: precomp-local time → main-comp time (cleared each Smart Scan). */
  var __precompMainTimeCache = {};

  function clearPrecompMainTimeCache() {
    __precompMainTimeCache = {};
  }

  function makePathTimeCacheKey(path, tPre) {
    var parts = [];
    for (var i = 0; i < path.length; i++) {
      parts.push(String(path[i].layer.index) + "@" + String(Number(path[i].layer.startTime || 0).toFixed(3)));
    }
    return parts.join("/") + "__" + String(Math.round(Number(tPre) * 1000));
  }

  /** Fast inverse of getPrecompLocalTimeAtMain (no AE comp switching). */
  function estimateMainTimeForPrecompLocalTime(path, tPre) {
    if (tPre == null || !isFinite(tPre) || !path || !path.length) return null;
    var tMain = Number(tPre);
    for (var p = path.length - 1; p >= 0; p--) {
      var pl = path[p].layer;
      var stretch = 1;
      try { stretch = Number(pl.timeStretch); } catch (e) {}
      if (!isFinite(stretch) || Math.abs(stretch) < 0.0001) stretch = 1;
      tMain = tMain * stretch + (Number(pl.startTime) || 0);
    }
    return tMain;
  }

  /** Per-level comp times along a precomp chain (main → … → deepest), for transforms and visibility. */
  function getMainCompTimesAlongPath(path, tMain) {
    var times = [];
    var t = tMain;
    for (var q = 0; q < path.length; q++) {
      times[q] = t;
      var pl = path[q].layer;
      var stretch = 1;
      try { stretch = Number(pl.timeStretch); } catch (e) {}
      if (!isFinite(stretch) || Math.abs(stretch) < 0.0001) stretch = 1;
      t = (t - (Number(pl.startTime) || 0)) / stretch;
    }
    return times;
  }

  /** Deepest precomp local time at a main-comp time (startTime + timeStretch along the chain). */
  function getPrecompLocalTimeAtMain(path, tMain) {
    var times = getMainCompTimesAlongPath(path, tMain);
    if (!times.length) return tMain;
    var t = tMain;
    for (var p = 0; p < path.length; p++) {
      var pl = path[p].layer;
      var stretch = 1;
      try { stretch = Number(pl.timeStretch); } catch (e) {}
      if (!isFinite(stretch) || Math.abs(stretch) < 0.0001) stretch = 1;
      t = (t - (Number(pl.startTime) || 0)) / stretch;
    }
    return t;
  }

  /**
   * Set main + each nested comp's playhead along the chain; return actual time read from deepest comp (layerComp).
   * Most reliable for main → A → B → text (double nest).
   */
  function syncMainChainAndReadDeepestTime(path, mainComp, layerComp, tMain) {
    if (tMain == null || !isFinite(tMain)) return null;
    try { mainComp.time = tMain; } catch (e0) {}
    var t = tMain;
    for (var p = 0; p < path.length; p++) {
      var pl = path[p].layer;
      var parentComp = path[p].comp;
      try {
        if (parentComp && parentComp.time !== undefined) parentComp.time = t;
      } catch (eT) {}
      var stretch = 1;
      try { stretch = Number(pl.timeStretch); } catch (e2) {}
      if (!isFinite(stretch) || Math.abs(stretch) < 0.0001) stretch = 1;
      t = (t - (Number(pl.startTime) || 0)) / stretch;
      if (pl.source && pl.source instanceof CompItem) {
        try { pl.source.time = t; } catch (eS) {}
      }
    }
    try {
      if (layerComp && layerComp.time !== undefined) return Number(layerComp.time);
    } catch (eR) {}
    return t;
  }

  /** True when every precomp layer in the chain is active at main-comp time tMain. */
  function isPrecompPathActiveAtMain(path, tMain) {
    if (!path || !path.length || tMain == null || !isFinite(tMain)) return false;
    var times = getMainCompTimesAlongPath(path, tMain);
    for (var p = 0; p < path.length; p++) {
      var pl = path[p].layer;
      var tAt = times[p];
      try { if (!pl.activeAtTime(tAt)) return false; } catch (e) { return false; }
    }
    return true;
  }

  /** Active + opacity/scale along the chain at main-comp time. */
  function isPrecompPathVisibleAtMain(path, tMain) {
    if (!isPrecompPathActiveAtMain(path, tMain)) return false;
    var times = getMainCompTimesAlongPath(path, tMain);
    for (var p = 0; p < path.length; p++) {
      var pl = path[p].layer;
      var tAt = times[p];
      if (layerOpacityAt(pl, tAt) < MIN_OPACITY) return false;
      if (layerScaleAt(pl, tAt) < MIN_SCALE) return false;
    }
    return true;
  }

  /** One shared main-comp screenshot time for all text in a nested precomp (second keyframe column). */
  function getCanonicalPrecompScreenshotMainTime(layerComp, mainComp, sampleLayer) {
    if (!layerComp || !mainComp || !sampleLayer) return null;
    var path = getPathToComp(mainComp, layerComp);
    if (!path.length) return null;
    var tSnap = getSnapshotMarkerTime(sampleLayer);
    var pathWin = getMainPrecompPathWindow(path, mainComp);
    if (tSnap != null && isFinite(tSnap)) {
      var tSnapMain = findMainTimeForPrecompLocalTime(path, tSnap, pathWin.start, pathWin.end, mainComp, layerComp);
      if (tSnapMain != null) return tSnapMain;
    }
    var keySearch = getLayerKeyframeSearchRange(sampleLayer, layerComp);
    var prefs = getPreferredScreenshotTimes(sampleLayer, keySearch.start, keySearch.end, true);
    if (!prefs || !prefs.length) return null;
    return findMainTimeForPrecompLocalTime(path, prefs[0], pathWin.start, pathWin.end, mainComp, layerComp);
  }

  /** Main-comp window where the top precomp layer is on the timeline. */
  function getMainPrecompPathWindow(path, mainComp) {
    if (!path || !path.length) {
      var d = 0;
      try { d = Number(mainComp.duration) || 0; } catch (e) {}
      return { start: 0, end: d > 0 ? d : 1 };
    }
    var firstLayer = path[0].layer;
    var mainWin = getCompScanWindow(mainComp);
    var aMain = Math.max(mainWin.start, Math.max(0, Number(firstLayer.inPoint || 0)));
    var bMain = Math.min(mainWin.end, Math.min(mainComp.duration || 1, Number(firstLayer.outPoint || 1)));
    return { start: aMain, end: bMain };
  }

  /** Find main-comp time for precomp-local tPre (fast estimate + small refine; one AE sync only if needed). */
  function findMainTimeForPrecompLocalTime(path, tPre, aMain, bMain, mainComp, layerComp) {
    if (tPre == null || !isFinite(tPre) || !path || !path.length) return null;
    var cacheKey = makePathTimeCacheKey(path, tPre);
    if (__precompMainTimeCache[cacheKey] != null) return __precompMainTimeCache[cacheKey];

    var step = mainComp.frameDuration || (1/24);
    if (!isFinite(step) || step <= 0) step = 1/24;
    var tol = Math.max(step * 1.5, 0.04);

    var tEst = estimateMainTimeForPrecompLocalTime(path, tPre);
    if (tEst == null || !isFinite(tEst)) return null;
    tEst = Math.round(tEst / step) * step;
    if (tEst < aMain) tEst = aMain;
    if (tEst > bMain) tEst = bMain;

    function acceptTime(tCand) {
      if (tCand == null || !isFinite(tCand)) return false;
      if (tCand < aMain - 0.001 || tCand > bMain + 0.001) return false;
      if (!isPrecompPathActiveAtMain(path, tCand)) return false;
      return Math.abs(getPrecompLocalTimeAtMain(path, tCand) - tPre) <= tol;
    }

    if (acceptTime(tEst)) {
      __precompMainTimeCache[cacheKey] = tEst;
      return tEst;
    }

    var bestT = tEst;
    var bestErr = Math.abs(getPrecompLocalTimeAtMain(path, tEst) - tPre);
    for (var j = -4; j <= 4; j++) {
      if (j === 0) continue;
      var tTry = tEst + j * step;
      if (tTry < aMain - 0.001 || tTry > bMain + 0.001) continue;
      if (!isPrecompPathActiveAtMain(path, tTry)) continue;
      var err = Math.abs(getPrecompLocalTimeAtMain(path, tTry) - tPre);
      if (err < bestErr) { bestErr = err; bestT = tTry; }
    }
    if (bestErr <= tol) {
      __precompMainTimeCache[cacheKey] = bestT;
      return bestT;
    }

    if (layerComp) {
      var tRead = syncMainChainAndReadDeepestTime(path, mainComp, layerComp, bestT);
      if (tRead != null && isFinite(tRead) && Math.abs(tRead - tPre) <= tol && isPrecompPathActiveAtMain(path, bestT)) {
        __precompMainTimeCache[cacheKey] = bestT;
        return bestT;
      }
    }
    return null;
  }

  /** Main-comp time range where nested text layer in/out overlaps the precomp instance on the timeline. */
  function getNestedTextMainTimeRange(layer, mainComp, path) {
    var win = getMainPrecompPathWindow(path, mainComp);
    var aMain = win.start;
    var bMain = win.end;
    var layerInPre = Number(layer.inPoint || 0);
    var layerOutPre = Number(layer.outPoint || 0);
    try {
      if (layerOutPre < layerInPre + 0.01 && path.length) {
        var src = path[path.length - 1].layer.source;
        if (src && src.duration != null) layerOutPre = Number(src.duration) || layerOutPre;
      }
    } catch (eDur) {}
    var inMain = estimateMainTimeForPrecompLocalTime(path, layerInPre);
    var outMain = estimateMainTimeForPrecompLocalTime(path, layerOutPre);
    if (inMain != null && outMain != null && outMain > inMain + 0.01) {
      return {
        layerInMain: Math.max(aMain, Math.min(bMain, inMain)),
        layerOutMain: Math.min(bMain, Math.max(aMain, outMain))
      };
    }
    return { layerInMain: aMain, layerOutMain: bMain };
  }

  /** Search full comp duration for keyframes (keyframes may sit outside trimmed layer in/out). */
  function getLayerKeyframeSearchRange(layer, comp) {
    var win = getCompScanWindow(comp);
    var compDur = 0;
    try { compDur = Number(comp.duration) || 0; } catch (e) {}
    var end = compDur > 0 ? Math.min(win.end, compDur) : win.end;
    if (end < win.start + 0.01) end = win.start + 0.01;
    return { start: win.start, end: end };
  }

  /** True if this precomp text layer is visible in the main comp at some frame. Respects temporal cropping: only considers main comp times that fall within the precomp layer's in/out and the text layer's in/out. */
  function hasVisibleFrameInMainComp(layer, layerComp, mainComp) {
    var path = getPathToComp(mainComp, layerComp);
    if (!path.length) return false;
    try {
      var step = mainComp.frameDuration || (1/24);
      if (!isFinite(step) || step <= 0) step = 1/24;
      function getPrecompTime(tMain) {
        var t = tMain;
        for (var p = 0; p < path.length; p++) t = t - (Number(path[p].layer.startTime) || 0);
        return t;
      }
      function precompLayerVisibleAt(tMain) {
        var t = tMain;
        for (var p = 0; p < path.length; p++) {
          var pl = path[p].layer;
          try { if (!pl.activeAtTime(t)) return false; } catch (e) { return false; }
          if (layerOpacityAt(pl, t) < MIN_OPACITY) return false;
          if (layerScaleAt(pl, t) < MIN_SCALE) return false;
          t = t - (Number(pl.startTime) || 0);
        }
        return true;
      }
      var firstLayer = path[0].layer;
      var mainWin = getCompScanWindow(mainComp);
      var aMain = Math.max(mainWin.start, Math.max(0, Number(firstLayer.inPoint || 0)));
      var bMain = Math.min(mainWin.end, Math.min(mainComp.duration || 1, Number(firstLayer.outPoint || 1)));
      if (bMain - aMain < 0.01) return false;
      var layerIn = Number(layer.inPoint || 0);
      var layerOut = Number(layer.outPoint || 0);

      // When layer has a track matte in layerComp, require paused + visible in matte so we don't exclude layers that only have valid frames when paused
      var matteInPrecomp = getMatteLayerAbove(layer, layerComp);
      if (matteInPrecomp) {
        var stepMainMatte = Math.min(step, (bMain - aMain) / 80);
        if (!isFinite(stepMainMatte) || stepMainMatte <= 0) stepMainMatte = step;
        for (var tMain = aMain; tMain <= bMain; tMain += stepMainMatte) {
          if (!precompLayerVisibleAt(tMain)) continue;
          var tPre = getPrecompTime(tMain);
          try { if (!layer.activeAtTime(tPre)) continue; } catch (e) { continue; }
          if (tPre < layerIn || tPre > layerOut) continue;
          if (!layerEligible(layer, tPre)) continue;
          if (!isLayerPausedAt(layer, layerComp, tPre)) continue;
          var refPre = getEffectiveBoundsForLayerAtTime(layer, layerComp, tPre);
          var info = bboxForLayer(layer, layerComp, tPre);
          if (!info || !info.bbox || info.bbox.w < 2 || info.bbox.h < 2) continue;
          if (!bboxIntersectsRect(info.bbox, refPre) || intersectionRatioRects(info.bbox, refPre) < MIN_IN_RATIO) continue;
          var times = [];
          var tt = tMain;
          for (var q = 0; q < path.length; q++) {
            times[q] = tt;
            tt = tt - (Number(path[q].layer.startTime) || 0);
          }
          var bb = info.bbox;
          var corners = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
          var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
          for (var c = 0; c < corners.length; c++) {
            var pt = corners[c];
            for (var p = path.length - 1; p >= 0; p--) {
              var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times[p]);
              if (!tr || tr.length < 2) break;
              pt = [tr[0], tr[1]];
            }
            if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
          }
          var bboxMain = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
          if (bboxIntersectsComp(mainComp, bboxMain) && intersectionRatio(mainComp, bboxMain) >= MIN_IN_RATIO) return true;
        }
      }

      var samples = Math.min(20, Math.max(1, Math.floor((bMain - aMain) / step)));
      for (var i = 0; i <= samples; i++) {
        var tMain = aMain + (bMain - aMain) * (i / Math.max(1, samples));
        if (!precompLayerVisibleAt(tMain)) continue;
        var tPre = getPrecompTime(tMain);
        try { if (!layer.activeAtTime(tPre)) continue; } catch (e) { continue; }
        if (tPre < layerIn || tPre > layerOut) continue;
        if (!layerEligible(layer, tPre)) continue;
        var info = bboxForLayer(layer, layerComp, tPre);
        if (!info || !info.bbox || info.bbox.w < 2 || info.bbox.h < 2) continue;
        var refPre = getEffectiveBoundsForLayerAtTime(layer, layerComp, tPre);
        if (!bboxIntersectsRect(info.bbox, refPre) || intersectionRatioRects(info.bbox, refPre) < MIN_IN_RATIO) continue;
        var times = [];
        var tt = tMain;
        for (var q = 0; q < path.length; q++) {
          times[q] = tt;
          tt = tt - (Number(path[q].layer.startTime) || 0);
        }
        var bb = info.bbox;
        var corners = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
        var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (var c = 0; c < corners.length; c++) {
          var pt = corners[c];
          for (var p = path.length - 1; p >= 0; p--) {
            var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times[p]);
            if (!tr || tr.length < 2) break;
            pt = [tr[0], tr[1]];
          }
          if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
        }
        var bboxMain = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        if (bboxIntersectsComp(mainComp, bboxMain) && intersectionRatio(mainComp, bboxMain) >= MIN_IN_RATIO) return true;
      }
    } catch (e) {}
    return false;
  }

  /** Map precomp-local time + bbox to main comp space (used for nested fallbacks). */
  function mapPrecompBboxToMainAtTime(layer, layerComp, mainComp, tPre, bbPre, sourceTag) {
    var path = getPathToComp(mainComp, layerComp);
    if (!path.length || !bbPre) return null;
    try {
      var pathWin = getMainPrecompPathWindow(path, mainComp);
      var tMain = findMainTimeForPrecompLocalTime(path, tPre, pathWin.start, pathWin.end, mainComp, layerComp);
      if (tMain == null) return null;
      var times = getMainCompTimesAlongPath(path, tMain);
      var bb = bbPre;
      var corners = [
        [bb.x, bb.y],
        [bb.x + bb.w, bb.y],
        [bb.x + bb.w, bb.y + bb.h],
        [bb.x, bb.y + bb.h]
      ];
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (var c = 0; c < corners.length; c++) {
        var pt = corners[c].slice();
        for (var p = path.length - 1; p >= 0; p--) {
          var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times[p]);
          if (!tr || tr.length < 2) return null;
          pt[0] = tr[0];
          pt[1] = tr[1];
        }
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      var bboxMain = { x: minX, y: minY, w: Math.max(2, maxX - minX), h: Math.max(2, maxY - minY) };
      if (!bboxIntersectsComp(mainComp, bboxMain)) {
        var mw = mainComp.width || 1920;
        var mh = mainComp.height || 1080;
        bboxMain = { x: 0, y: 0, w: mw, h: mh };
      }
      return { t: tMain, bbox: bboxMain, source: sourceTag || "nested-mapped" };
    } catch (e) {}
    return null;
  }

  /** Build nested screenshot result at a known main-comp time (fast path after per-precomp canonical time). */
  function buildNestedScreenshotAtMainTime(layer, layerComp, mainComp, tMain, sourceTag) {
    if (tMain == null || !isFinite(tMain)) return null;
    var path = getPathToComp(mainComp, layerComp);
    if (!path.length) return null;
    try { layerComp.time = getPrecompLocalTimeAtMain(path, tMain); } catch (eLc) {}
    var tPre = getPrecompLocalTimeAtMain(path, tMain);
    try { if (!layer.activeAtTime(tPre)) return null; } catch (eAct) { return null; }
    var info = bboxForLayer(layer, layerComp, tPre);
    var bb = info ? info.bbox : null;
    if (!bb || bb.w < 1 || bb.h < 1) bb = bboxFromPositionRescue(layer, layerComp, tPre);
    if (!bb || bb.w < 1 || bb.h < 1) {
      bb = { x: 0, y: 0, w: Math.max(2, layerComp.width || 100), h: Math.max(2, layerComp.height || 50) };
    }
    var mapped = mapPrecompBboxToMainAtTime(layer, layerComp, mainComp, tPre, bb, sourceTag);
    if (mapped) return mapped;
    return { t: tMain, bbox: bb, source: sourceTag || "nested-time" };
  }

  /**
   * Precomp text: snapshot marker or second keyframe in precomp local time → main comp.
   * precomputedMainTime: optional (from one canonical pass per nested comp).
   */
  function tryNestedScreenshotFromPrecompTimes(layer, layerComp, mainComp, precomputedMainTime) {
    if (precomputedMainTime != null && isFinite(precomputedMainTime)) {
      return buildNestedScreenshotAtMainTime(layer, layerComp, mainComp, precomputedMainTime, "second-keyframe-precomp");
    }
    var path = getPathToComp(mainComp, layerComp);
    if (!path.length) return null;
    var pathWin = getMainPrecompPathWindow(path, mainComp);
    var aMain = pathWin.start;
    var bMain = pathWin.end;
    if (bMain - aMain < 0.01) return null;

    var tSnap = getSnapshotMarkerTime(layer);
    if (tSnap != null) {
      var tSnapMain = findMainTimeForPrecompLocalTime(path, tSnap, aMain, bMain, mainComp, layerComp);
      if (tSnapMain != null) {
        var snapHit = buildNestedScreenshotAtMainTime(layer, layerComp, mainComp, tSnapMain, "snapshot-marker");
        if (snapHit) return snapHit;
      }
    }

    var keySearch = getLayerKeyframeSearchRange(layer, layerComp);
    var prefs = getPreferredScreenshotTimes(layer, keySearch.start, keySearch.end, true);
    if (!prefs || !prefs.length) return null;
    var tMainKf = findMainTimeForPrecompLocalTime(path, prefs[0], aMain, bMain, mainComp, layerComp);
    if (tMainKf == null) return null;
    return buildNestedScreenshotAtMainTime(layer, layerComp, mainComp, tMainKf, "second-keyframe-precomp");
  }

  /** For a text layer inside a precomp: find main comp time and bbox in main comp space. Returns { t, bbox, source } or null. */
  function findBestTimeInMainCompForNestedLayer(layer, layerComp, mainComp) {
    var path = getPathToComp(mainComp, layerComp);
    if (!path.length) return null;

    var fromPrecomp = tryNestedScreenshotFromPrecompTimes(layer, layerComp, mainComp);
    if (fromPrecomp) return fromPrecomp;

    // main → A → B (or deeper): scanning the main timeline picks frames with no keyframes in B.
    if (path.length >= 2) {
      var fallDeep = getFallbackTimeAndBbox(layer, layerComp, true);
      if (fallDeep && fallDeep.bbox) {
        var mappedDeep = mapPrecompBboxToMainAtTime(layer, layerComp, mainComp, fallDeep.t, fallDeep.bbox, fallDeep.source);
        if (mappedDeep) return mappedDeep;
        var winDeep = getMainPrecompPathWindow(path, mainComp);
        var tMainDeep = findMainTimeForPrecompLocalTime(path, fallDeep.t, winDeep.start, winDeep.end, mainComp, layerComp);
        if (tMainDeep != null) {
          try { mainComp.time = tMainDeep; app.project.activeItem = mainComp; } catch (eD) {}
          return { t: tMainDeep, bbox: fallDeep.bbox, source: fallDeep.source || "nested-fallback" };
        }
      }
      return null;
    }

    var step = mainComp.frameDuration || (1/24);
    if (!isFinite(step) || step <= 0) step = 1/24;

    // Time in layerComp at main time t_main: walk path and subtract startTimes
    function getPrecompTime(tMain) {
      var t = tMain;
      for (var p = 0; p < path.length; p++) {
        var pl = path[p].layer;
        t = t - (Number(pl.startTime) || 0);
      }
      return t;
    }

    function precompLayerVisibleAt(tMain) {
      var t = tMain;
      for (var p = 0; p < path.length; p++) {
        var pl = path[p].layer;
        try { if (!pl.activeAtTime(t)) return false; } catch (e) { return false; }
        if (layerOpacityAt(pl, t) < MIN_OPACITY) return false;
        if (layerScaleAt(pl, t) < MIN_SCALE) return false;
        t = t - (Number(pl.startTime) || 0);
      }
      return true;
    }

    // Find a main comp time range where the precomp chain is visible
    var firstLayer = path[0].layer;
    var mainWin = getCompScanWindow(mainComp);
    var aMain = Math.max(mainWin.start, Math.max(0, Number(firstLayer.inPoint || 0)));
    var bMain = Math.min(mainWin.end, Math.min(mainComp.duration || 1, Number(firstLayer.outPoint || 1)));
    if (bMain - aMain < 0.01) return null;

    var best = null;
    var layerIn = Number(layer.inPoint || 0);
    var layerOut = Number(layer.outPoint || 0);
    var sumStart = 0;
    for (var si = 0; si < path.length; si++) sumStart += Number(path[si].layer.startTime || 0);

    // Typewriter: max text length in precomp so we prefer full-reveal frames
    var precompStep = layerComp.frameDuration || (1/24);
    if (!isFinite(precompStep) || precompStep <= 0) precompStep = 1/24;
    var maxLen = 0;
    for (var tPreScan = layerIn; tPreScan <= layerOut; tPreScan += precompStep) {
      if (!layerEligible(layer, tPreScan)) continue;
      var len = textLenAt(layer, tPreScan);
      if (len > maxLen) maxLen = len;
    }
    // Simple typewriter: only when rect grows (plain text has constant rect). Long constant-length = built-in preset, use tail.
    var tMinPreForFullReveal = layerIn;
    if (maxLen > 0 && isConstantLengthTypewriter(layer, layerComp, maxLen)) {
      if (rectWidthGrowsOverDuration(layer, layerComp)) {
        var fullVisualPre = getTimeOfFullVisualReveal(layer, layerComp);
        if (fullVisualPre && fullVisualPre.t > layerIn) tMinPreForFullReveal = fullVisualPre.t;
        var tailStartPre = getMinTimeInTypewriterTail(layer, false);
        if (tailStartPre > tMinPreForFullReveal) tMinPreForFullReveal = tailStartPre;
      } else if ((layerOut - layerIn) >= 2) {
        var tailStartPre = getMinTimeInTypewriterTail(layer, isAnimatorTypewriter(layer, layerComp, maxLen));
        tMinPreForFullReveal = tailStartPre;
      }
      if (isAnimatorTypewriter(layer, layerComp, maxLen)) {
        var tStart100Pre = getTimeWhenTypewriterFullReveal(layer, layerComp, maxLen);
        if (tStart100Pre != null && tStart100Pre >= layerIn) tMinPreForFullReveal = Math.min(layerOut, Math.max(layerIn, tStart100Pre));
        else {
          var tailAnimatorPre = getMinTimeInTypewriterTail(layer, true);
          if (tailAnimatorPre > tMinPreForFullReveal) tMinPreForFullReveal = tailAnimatorPre;
        }
      }
    }

    // Dedicated track-matte + pause path for nested: when the precomp text layer has a matte, prefer first main-comp time where the layer is paused (in precomp) and visible in matte.
    var matteLayerNested = getMatteLayerAbove(layer, layerComp);
    if (matteLayerNested) {
      // Sample at least every main-comp frame so we don't miss short pauses in nested precomps
      var sampleStepMain = Math.min(mainComp.frameDuration || step, Math.max(step, (bMain - aMain) / 120));
      if (!isFinite(sampleStepMain) || sampleStepMain <= 0) sampleStepMain = step;
      for (var tMain = aMain; tMain <= bMain; tMain += sampleStepMain) {
        if (!precompLayerVisibleAt(tMain)) continue;
        var tPre = getPrecompTime(tMain);
        try { if (!layer.activeAtTime(tPre)) continue; } catch (e) { continue; }
        if (tPre < layerIn || tPre > layerOut) continue;
        if (!layerEligible(layer, tPre)) continue;
        if (!isLayerPausedAt(layer, layerComp, tPre)) continue;
        var refPre = getEffectiveBoundsForLayerAtTime(layer, layerComp, tPre);
        var info = bboxForLayer(layer, layerComp, tPre);
        if (!info || !info.bbox || info.bbox.w < 2 || info.bbox.h < 2) continue;
        var bb = info.bbox;
        if (!bboxIntersectsRect(bb, refPre) || intersectionRatioRects(bb, refPre) < MIN_IN_RATIO) continue;
        if (maxLen > 0 && textLenAt(layer, tPre) < maxLen) continue;
        try {
          var times = [];
          var tt = tMain;
          for (var q = 0; q < path.length; q++) {
            times[q] = tt;
            tt = tt - (Number(path[q].layer.startTime) || 0);
          }
          var corners = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
          var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
          for (var c = 0; c < corners.length; c++) {
            var pt = corners[c];
            for (var p = path.length - 1; p >= 0; p--) {
              var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times[p]);
              if (!tr || tr.length < 2) break;
              pt = [tr[0], tr[1]];
            }
            if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
          }
          var bboxMain = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
          if (!bboxIntersectsComp(mainComp, bboxMain) || intersectionRatio(mainComp, bboxMain) < MIN_IN_RATIO) continue;
          try { mainComp.time = tMain; app.project.activeItem = mainComp; } catch (eRestore) {}
          return { t: tMain, bbox: bboxMain, source: (info && info.source) || 'nested' };
        } catch (eInner) {}
      }
    }

    var animatorTwNested = maxLen > 0 && isAnimatorTypewriter(layer, layerComp, maxLen);
    var mainStart = aMain, mainEnd = bMain, mainStep = step;
    if (tMinPreForFullReveal > layerIn) { mainStart = bMain; mainEnd = aMain; mainStep = -step; }
    for (var tMain = mainStart; tMinPreForFullReveal > layerIn ? (tMain >= mainEnd) : (tMain <= mainEnd); tMain += mainStep) {
      if (!precompLayerVisibleAt(tMain)) continue;
      var tPre = getPrecompTime(tMain);
      try { if (!layer.activeAtTime(tPre)) continue; } catch (e) { continue; }
      if (tPre < layerIn || tPre > layerOut) continue;
      if (tPre < tMinPreForFullReveal) continue;
      if (!layerEligible(layer, tPre)) continue;
      if (maxLen > 0 && textLenAt(layer, tPre) < maxLen) continue;
      var stable = true;
      var stableFramesRequiredNested = animatorTwNested ? 1 : STABLE_FRAMES;
      for (var k = 1; k <= stableFramesRequiredNested; k++) {
        var tPreK = tPre + k * precompStep;
        if (tPreK > layerOut) break;
        if (!layerEligible(layer, tPreK) || textLenAt(layer, tPreK) < maxLen) { stable = false; break; }
        var infoK = bboxForLayer(layer, layerComp, tPreK);
        var refPreK = getEffectiveBoundsForLayerAtTime(layer, layerComp, tPreK);
        if (!infoK || !infoK.bbox || !bboxIntersectsRect(infoK.bbox, refPreK) || intersectionRatioRects(infoK.bbox, refPreK) < MIN_IN_RATIO) { stable = false; break; }
      }
      if (!stable) continue;

      var info = bboxForLayer(layer, layerComp, tPre);
      var bb = info ? info.bbox : null;
      if (!bb || bb.w < 2 || bb.h < 2) continue;
      var refPre = getEffectiveBoundsForLayerAtTime(layer, layerComp, tPre);
      if (!bboxIntersectsRect(bb, refPre) || intersectionRatioRects(bb, refPre) < MIN_IN_RATIO) continue;

      // Transform bbox from layerComp to mainComp using valueAtTime only (do not set comp.time)
      try {
        var times = [];
        var tt = tMain;
        for (var q = 0; q < path.length; q++) {
          times[q] = tt;
          tt = tt - (Number(path[q].layer.startTime) || 0);
        }
        var corners = [
          [bb.x, bb.y],
          [bb.x + bb.w, bb.y],
          [bb.x + bb.w, bb.y + bb.h],
          [bb.x, bb.y + bb.h]
        ];
        var mainCorners = [];
        for (var c = 0; c < corners.length; c++) {
          var pt = corners[c];
          for (var p = path.length - 1; p >= 0; p--) {
            var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times[p]);
            if (!tr || tr.length < 2) break;
            pt = [tr[0], tr[1]];
          }
          mainCorners.push(pt);
        }
        var minX = mainCorners[0][0], maxX = mainCorners[0][0], minY = mainCorners[0][1], maxY = mainCorners[0][1];
        for (var m = 1; m < mainCorners.length; m++) {
          minX = Math.min(minX, mainCorners[m][0]); maxX = Math.max(maxX, mainCorners[m][0]);
          minY = Math.min(minY, mainCorners[m][1]); maxY = Math.max(maxY, mainCorners[m][1]);
        }
        var bboxMain = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        if (!bboxIntersectsComp(mainComp, bboxMain)) continue;
        if (intersectionRatio(mainComp, bboxMain) < MIN_IN_RATIO) continue;

        var score = intersectionRatio(mainComp, bboxMain);
        var op = layerOpacityAt(layer, tPre) / 100;
        var sc = Math.min(1, layerScaleAt(layer, tPre));
        score *= (0.5 + 0.5 * op);
        score *= (0.3 + 0.7 * sc);
        if (!best || score > best.score) {
          best = { t: tMain, bbox: bboxMain, source: (info && info.source) || 'nested', score: score };
          if (tMinPreForFullReveal > layerIn) break;
        }
      } catch (e) {}
    }

    if (best) {
      try { mainComp.time = best.t; app.project.activeItem = mainComp; } catch(eRestore){}
      return { t: best.t, bbox: best.bbox, source: best.source };
    }

    // Pass 2: same as strict but without stability (typewriter may not have 3 stable frames). When typewriter tail, prefer latest.
    var mainStart2 = aMain, mainEnd2 = bMain, mainStep2 = step;
    if (tMinPreForFullReveal > layerIn) { mainStart2 = bMain; mainEnd2 = aMain; mainStep2 = -step; }
    for (var tMain2 = mainStart2; tMinPreForFullReveal > layerIn ? (tMain2 >= mainEnd2) : (tMain2 <= mainEnd2); tMain2 += mainStep2) {
      if (!precompLayerVisibleAt(tMain2)) continue;
      var tPre2 = getPrecompTime(tMain2);
      try { if (!layer.activeAtTime(tPre2)) continue; } catch (e) { continue; }
      if (tPre2 < layerIn || tPre2 > layerOut) continue;
      if (tPre2 < tMinPreForFullReveal) continue;
      if (!layerEligible(layer, tPre2)) continue;
      if (maxLen > 0 && textLenAt(layer, tPre2) < maxLen) continue;
      var info2 = bboxForLayer(layer, layerComp, tPre2);
      var bb2 = info2 ? info2.bbox : null;
      if (!bb2 || bb2.w < 2 || bb2.h < 2) continue;
      var refPre2 = getEffectiveBoundsForLayerAtTime(layer, layerComp, tPre2);
      if (!bboxIntersectsRect(bb2, refPre2) || intersectionRatioRects(bb2, refPre2) < MIN_IN_RATIO) continue;
      try {
        var times2 = [];
        var tt2 = tMain2;
        for (var q = 0; q < path.length; q++) {
          times2[q] = tt2;
          tt2 = tt2 - (Number(path[q].layer.startTime) || 0);
        }
        var corners2 = [
          [bb2.x, bb2.y],
          [bb2.x + bb2.w, bb2.y],
          [bb2.x + bb2.w, bb2.y + bb2.h],
          [bb2.x, bb2.y + bb2.h]
        ];
        var mainCorners2 = [];
        for (var c = 0; c < corners2.length; c++) {
          var pt = corners2[c];
          for (var p = path.length - 1; p >= 0; p--) {
            var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times2[p]);
            if (!tr || tr.length < 2) break;
            pt = [tr[0], tr[1]];
          }
          mainCorners2.push(pt);
        }
        var minX2 = mainCorners2[0][0], maxX2 = mainCorners2[0][0], minY2 = mainCorners2[0][1], maxY2 = mainCorners2[0][1];
        for (var m = 1; m < mainCorners2.length; m++) {
          minX2 = Math.min(minX2, mainCorners2[m][0]); maxX2 = Math.max(maxX2, mainCorners2[m][0]);
          minY2 = Math.min(minY2, mainCorners2[m][1]); maxY2 = Math.max(maxY2, mainCorners2[m][1]);
        }
        var bboxMain2 = { x: minX2, y: minY2, w: maxX2 - minX2, h: maxY2 - minY2 };
        if (!bboxIntersectsComp(mainComp, bboxMain2) || intersectionRatio(mainComp, bboxMain2) < MIN_IN_RATIO) continue;
        var score2 = intersectionRatio(mainComp, bboxMain2);
        var op2 = layerOpacityAt(layer, tPre2) / 100;
        var sc2 = Math.min(1, layerScaleAt(layer, tPre2));
        score2 *= (0.5 + 0.5 * op2);
        score2 *= (0.3 + 0.7 * sc2);
        if (!best || score2 > best.score) {
          best = { t: tMain2, bbox: bboxMain2, source: (info2 && info2.source) || 'nested', score: score2 };
          if (tMinPreForFullReveal > layerIn) break;
        }
      } catch (e) {}
    }

    if (best) {
      try { mainComp.time = best.t; app.project.activeItem = mainComp; } catch(eRestore){}
      return { t: best.t, bbox: best.bbox, source: best.source };
    }

    // Relaxed pass: still require layerEligible, precomp chain visible, and full typewriter reveal
    var sampleCount = Math.min(8, Math.max(1, Math.floor((bMain - aMain) / step)));
    for (var n = 0; n < sampleCount; n++) {
      var tMain = aMain + (bMain - aMain) * (n + 1) / (sampleCount + 1);
      if (!precompLayerVisibleAt(tMain)) continue;
      var tPre = getPrecompTime(tMain);
      try { if (!layer.activeAtTime(tPre)) continue; } catch (e) { continue; }
      if (tPre < layerIn || tPre > layerOut) continue;
      if (tPre < tMinPreForFullReveal) continue;
      if (!layerEligible(layer, tPre)) continue;
      if (maxLen > 0 && textLenAt(layer, tPre) < maxLen) continue;
      var info = bboxForLayer(layer, layerComp, tPre);
      var bb = info ? info.bbox : null;
      if (!bb || bb.w < 2 || bb.h < 2) continue;
      var refPre = getEffectiveBoundsForLayerAtTime(layer, layerComp, tPre);
      if (!bboxIntersectsRect(bb, refPre) || intersectionRatioRects(bb, refPre) < MIN_IN_RATIO) continue;
      try {
        var times = [];
        var tt = tMain;
        for (var q = 0; q < path.length; q++) {
          times[q] = tt;
          tt = tt - (Number(path[q].layer.startTime) || 0);
        }
        var corners = [
          [bb.x, bb.y],
          [bb.x + bb.w, bb.y],
          [bb.x + bb.w, bb.y + bb.h],
          [bb.x, bb.y + bb.h]
        ];
        var mainCorners = [];
        for (var c = 0; c < corners.length; c++) {
          var pt = corners[c];
          for (var p = path.length - 1; p >= 0; p--) {
            var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times[p]);
            if (!tr || tr.length < 2) break;
            pt = [tr[0], tr[1]];
          }
          mainCorners.push(pt);
        }
        var minX = mainCorners[0][0], maxX = mainCorners[0][0], minY = mainCorners[0][1], maxY = mainCorners[0][1];
        for (var m = 1; m < mainCorners.length; m++) {
          minX = Math.min(minX, mainCorners[m][0]); maxX = Math.max(maxX, mainCorners[m][0]);
          minY = Math.min(minY, mainCorners[m][1]); maxY = Math.max(maxY, mainCorners[m][1]);
        }
        var bboxMain = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        if (bboxIntersectsComp(mainComp, bboxMain) && intersectionRatio(mainComp, bboxMain) >= MIN_IN_RATIO) {
          try { mainComp.time = tMain; app.project.activeItem = mainComp; } catch(eR){}
          return { t: tMain, bbox: bboxMain, source: (info && info.source) || 'nested' };
        }
      } catch (e) {}
    }

    // Fallback: use precomp's fallback time/bbox and map to main comp; require scale/opacity meet minimums
    try {
      var fall = getFallbackTimeAndBbox(layer, layerComp);
      if (!fall || !fall.bbox) return null;
      var tPre = fall.t;
      if (layerScaleAt(layer, tPre) < MIN_SCALE) return null;
      if (layerOpacityAt(layer, tPre) < MIN_OPACITY) return null;
      var tMainFall = findMainTimeForPrecompLocalTime(path, tPre, aMain, bMain, mainComp, layerComp);
      if (tMainFall == null) return null;
      if (!precompLayerVisibleAt(tMainFall)) return null;

      var times = [];
      var tt = tMainFall;
      for (var q = 0; q < path.length; q++) {
        times[q] = tt;
        tt = tt - (Number(path[q].layer.startTime) || 0);
      }
      var bb = fall.bbox;
      var corners = [
        [bb.x, bb.y],
        [bb.x + bb.w, bb.y],
        [bb.x + bb.w, bb.y + bb.h],
        [bb.x, bb.y + bb.h]
      ];
      var mainCorners = [];
      for (var c = 0; c < corners.length; c++) {
        var pt = corners[c];
        for (var p = path.length - 1; p >= 0; p--) {
          var tr = layerPointToCompAtTime(path[p].layer, [pt[0], pt[1]], times[p]);
          if (!tr || tr.length < 2) break;
          pt = [tr[0], tr[1]];
        }
        mainCorners.push(pt);
      }
      var minX = mainCorners[0][0], maxX = mainCorners[0][0], minY = mainCorners[0][1], maxY = mainCorners[0][1];
      for (var m = 1; m < mainCorners.length; m++) {
        minX = Math.min(minX, mainCorners[m][0]); maxX = Math.max(maxX, mainCorners[m][0]);
        minY = Math.min(minY, mainCorners[m][1]); maxY = Math.max(maxY, mainCorners[m][1]);
      }
      var bboxMain = { x: minX, y: minY, w: Math.max(2, maxX - minX), h: Math.max(2, maxY - minY) };
      if (bboxIntersectsComp(mainComp, bboxMain) && intersectionRatio(mainComp, bboxMain) >= MIN_IN_RATIO) {
        try { mainComp.time = tMainFall; app.project.activeItem = mainComp; } catch(eR){}
        return { t: tMainFall, bbox: bboxMain, source: fall.source || 'nested' };
      }
    } catch (e) {}

    return null;
  }

  function smartScanTimeline(setStatus, setProgress, compOptional, exportOnlyCollector){
    if (!STATE.projectId) return false;

    var comp = (compOptional && compOptional instanceof CompItem) ? compOptional : getActiveComp();
    if (!comp) return false;

    if (!STATE.fileKey) STATE.fileKey = safeFileKeyForComp(comp);

    /** Clear Blinking Cursor dimension cache so each scan starts fresh. */
    __blinkFullTextSizeCache = {};
    clearPrecompMainTimeCache();

    // Scale comp for scan/export: same rule on Mac and Windows — temporary 1920×1080 proportions, quality by half (resolution set below).
    // Scale to height 1080 so export fits standard frame; restore scale in finally.
    var scaleFactorApplied = null;
    if (Math.abs(comp.height - CROWDIN_EXPORT_MAX_H) > 0.5) {
      var scaleToHeight = CROWDIN_EXPORT_MAX_H / comp.height;
      if (scaleToHeight > 0 && scaleCompositionByFactor(comp, scaleToHeight)) scaleFactorApplied = scaleToHeight;
    }
    if (IS_WIN) {
      scanDebugLog("--- Scan start (same rules as Mac: best frame, marker, second keyframe, text only) ---");
      scanDebugLog("Comp after scale: " + comp.width + "x" + comp.height);
    }

    try {
    var layerComps = getTextLayersForExport(comp);
    if (typeof DEBUG_TYPEWRITER_LOG !== "undefined" && DEBUG_TYPEWRITER_LOG) {
      try {
        var dbgFile = new File(Folder.myDocuments.fsName + "/Crowdin_typewriter_debug.txt");
        if (dbgFile.exists) dbgFile.remove();
      } catch (e) {}
    }
    if (!layerComps.length) {
      setStatus("Smart Scan skipped (no text layers in comp).");
      if (setProgress) setProgress(0, 0, "Ready");
      return false;
    }

    var scanStartMs = new Date().getTime();
    function elapsedSec() { return ((new Date().getTime() - scanStartMs) / 1000).toFixed(1); }
    function statusWithTime(msg) { setStatus(msg); }
    function progressWithTime(current, total, msg) { if (setProgress) setProgress(current, total, msg || "Ready"); }

    setStatus("Timeline Scan: Analyzing...");
    progressWithTime(0, layerComps.length, "Analyzing…");

    var TMP = Folder.temp;
    var step = comp.frameDuration || (1 / 24);
    if (!isFinite(step) || step <= 0) step = 1 / 24;

    // One canonical main-comp time per nested precomp (avoids repeating full timeline search per text layer).
    var nestedMainByCompId = {};
    for (var ni = 0; ni < layerComps.length; ni++) {
      var nlc = layerComps[ni].comp;
      if (nlc === comp) continue;
      var nid = String(nlc.id);
      if (nestedMainByCompId[nid] != null) continue;
      nestedMainByCompId[nid] = getCanonicalPrecompScreenshotMainTime(nlc, comp, layerComps[ni].layer);
    }

    // First pass: get best time + bbox for each layer
    var candidates = [];
    for (var i = 0; i < layerComps.length; i++) {
      progressWithTime(i, layerComps.length, "Layer " + (i + 1) + " of " + layerComps.length);
      var L = layerComps[i].layer;
      var layerComp = layerComps[i].comp;
      if (L.matchName !== "ADBE Text Layer") continue;
      var id = makeStringKey(layerComp, L);
      var preMain = (layerComp !== comp) ? nestedMainByCompId[String(layerComp.id)] : null;
      var best = tryScreenshotForTextLayer(L, layerComp, comp, preMain);
      if (!best) continue;
      // Typewriter Blinking Cursor: force bbox to full-text size at 100% so the workaround always applies (findBestTime may have used another path).
      if (hasBlinkingCursorTypewriterEffect(L)) {
        var stepFrame = (layerComp.frameDuration || 1/24);
        if (isFinite(stepFrame) && stepFrame > 0) best.t = Math.round(best.t / stepFrame) * stepFrame;
        var tPreBlink = best.t;
        if (layerComp !== comp) {
          var pathBlink = getPathToComp(comp, layerComp);
          tPreBlink = getPrecompLocalTimeAtMain(pathBlink, best.t);
        }
        var bbBlink = bboxEstimateFromTextDocNoCursor(L, tPreBlink, layerComp);
        if (bbBlink && bbBlink.w >= 2 && bbBlink.h >= 2) {
          if (layerComp === comp) {
            best = { t: best.t, bbox: bbBlink, source: "blinkFullText" };
          } else {
            var mappedBlink = mapPrecompBboxToMainAtTime(L, layerComp, comp, tPreBlink, bbBlink, "blinkFullText");
            if (mappedBlink) best = mappedBlink;
          }
        }
      }
      var layerText = "";
      try { var sp = getSourceTextProp(L); if (sp) layerText = getCompletedTextForLayer(L, layerComp); } catch (e) {}
      candidates.push({ layer: L, layerComp: layerComp, id: id, best: best, layerText: layerText });
    }

    // Second pass: any text layer we export strings for must get a screenshot attempt.
    var seenCandId = {};
    for (var cix = 0; cix < candidates.length; cix++) seenCandId[candidates[cix].id] = true;
    for (var ii = 0; ii < layerComps.length; ii++) {
      var L2 = layerComps[ii].layer;
      var layerComp2 = layerComps[ii].comp;
      if (L2.matchName !== "ADBE Text Layer") continue;
      var id2 = makeStringKey(layerComp2, L2);
      if (seenCandId[id2]) continue;
      var preMain2 = (layerComp2 !== comp) ? nestedMainByCompId[String(layerComp2.id)] : null;
      var best2 = tryScreenshotForTextLayer(L2, layerComp2, comp, preMain2);
      if (!best2) continue;
      var layerText2 = "";
      try { var sp2 = getSourceTextProp(L2); if (sp2) layerText2 = getCompletedTextForLayer(L2, layerComp2); } catch (e2) {}
      candidates.push({ layer: L2, layerComp: layerComp2, id: id2, best: best2, layerText: layerText2 });
      seenCandId[id2] = true;
      scanDebugLog("Rescue candidate added for missing layer " + id2);
    }

    // Third pass: one screenshot candidate per text layer id (never skip duplicates with identical text).
    for (var ii3 = 0; ii3 < layerComps.length; ii3++) {
      var L3 = layerComps[ii3].layer;
      var layerComp3 = layerComps[ii3].comp;
      if (L3.matchName !== "ADBE Text Layer") continue;
      var id3 = makeStringKey(layerComp3, L3);
      if (seenCandId[id3]) continue;
      var preMain3 = (layerComp3 !== comp) ? nestedMainByCompId[String(layerComp3.id)] : null;
      var best3 = tryScreenshotForTextLayer(L3, layerComp3, comp, preMain3);
      if (!best3) continue;
      var layerText3 = "";
      try { var sp3 = getSourceTextProp(L3); if (sp3) layerText3 = getCompletedTextForLayer(L3, layerComp3); } catch (e3) {}
      candidates.push({ layer: L3, layerComp: layerComp3, id: id3, best: best3, layerText: layerText3 });
      seenCandId[id3] = true;
      scanDebugLog("Mandatory candidate for layer " + id3);
    }

    function reconcileCandidatesWithLayerComps() {
      var seenR = {};
      for (var r0 = 0; r0 < candidates.length; r0++) seenR[candidates[r0].id] = true;
      for (var rj = 0; rj < layerComps.length; rj++) {
        var LR = layerComps[rj].layer;
        var lcr = layerComps[rj].comp;
        if (LR.matchName !== "ADBE Text Layer") continue;
        var idR = makeStringKey(lcr, LR);
        if (seenR[idR]) continue;
        var preR = (lcr !== comp) ? nestedMainByCompId[String(lcr.id)] : null;
        var bestR = tryScreenshotForTextLayer(LR, lcr, comp, preR);
        if (!bestR) continue;
        var txtR = "";
        try { var spR = getSourceTextProp(LR); if (spR) txtR = getCompletedTextForLayer(LR, lcr); } catch (eRtxt) {}
        candidates.push({ layer: LR, layerComp: lcr, id: idR, best: bestR, layerText: txtR });
        seenR[idR] = true;
        scanDebugLog("Reconcile candidate " + idR);
      }
    }
    reconcileCandidatesWithLayerComps();

    if (candidates.length < layerComps.length) {
      scanDebugLog("WARN: " + (layerComps.length - candidates.length) + " text layer(s) still have no screenshot time");
    }

    // Nested precomps: all text layers share the same second-keyframe column — one main-comp time per precomp (no per-layer nudge).
    var stepFrame = comp.frameDuration || (1 / 24);
    if (!isFinite(stepFrame) || stepFrame <= 0) stepFrame = 1 / 24;
    var compEnd = 0;
    try { compEnd = Number(comp.duration) || 0; } catch (e) {}
    var canonicalNestedMainTime = {};
    for (var cni = 0; cni < candidates.length; cni++) {
      var cn = candidates[cni];
      if (cn.layerComp === comp) continue;
      var pcid = String(cn.layerComp.id);
      if (canonicalNestedMainTime[pcid] != null) continue;
      var tCanon = getCanonicalPrecompScreenshotMainTime(cn.layerComp, comp, cn.layer);
      if (tCanon != null) canonicalNestedMainTime[pcid] = Math.round(tCanon / stepFrame) * stepFrame;
    }
    for (var cj = 0; cj < candidates.length; cj++) {
      var cn2 = candidates[cj];
      if (cn2.layerComp === comp) continue;
      var pcid2 = String(cn2.layerComp.id);
      var tShared = canonicalNestedMainTime[pcid2];
      if (tShared == null) continue;
      cn2.best.t = tShared;
      var pathShared = getPathToComp(comp, cn2.layerComp);
      var tPreShared = getPrecompLocalTimeAtMain(pathShared, tShared);
      var infoShared = bboxForLayer(cn2.layer, cn2.layerComp, tPreShared);
      var bbShared = infoShared ? infoShared.bbox : null;
      if (!bbShared || bbShared.w < 1) bbShared = bboxFromPositionRescue(cn2.layer, cn2.layerComp, tPreShared);
      if (bbShared && bbShared.w >= 1) {
        var mappedShared = mapPrecompBboxToMainAtTime(cn2.layer, cn2.layerComp, comp, tPreShared, bbShared, cn2.best.source || "second-keyframe-precomp");
        if (mappedShared) cn2.best = mappedShared;
      }
    }

    // Main-comp layers only: unique capture time per layer (nested precomps already share canonical time above).
    var usedTime = {};
    for (var ci = 0; ci < candidates.length; ci++) {
      var c = candidates[ci];
      if (c.layerComp !== comp) continue;
      var tOriginal = c.best.t;
      var layerInMain = Math.max(0, Number(c.layer.inPoint) || 0);
      var layerOutMain = Math.min(compEnd, Math.max(0, Number(c.layer.outPoint) || compEnd));
      var keySearchMain = getLayerKeyframeSearchRange(c.layer, c.layerComp);
      var tSnapPin = getSnapshotMarkerTime(c.layer);
      if (tSnapPin != null && isFinite(tSnapPin) && tSnapPin >= keySearchMain.start - 0.001 && tSnapPin <= keySearchMain.end + 0.001) {
        var tSnapRound = Math.round(tSnapPin / stepFrame) * stepFrame;
        c.best.t = tSnapRound;
        c.best.source = "snapshot-marker";
        var infoSnapPin = bboxForLayer(c.layer, c.layerComp, tSnapPin);
        if (infoSnapPin && infoSnapPin.bbox && infoSnapPin.bbox.w >= 1) {
          c.best.bbox = infoSnapPin.bbox;
        }
        usedTime[tSnapRound.toFixed(6) + "_L" + c.layer.index] = true;
        continue;
      }
      var preferredTimesMain = getPreferredScreenshotTimes(c.layer, keySearchMain.start, keySearchMain.end, true);
      var revealMinMain = getTimeWhenRangeSelectorAnimatorReveal(c.layer, layerInMain, layerOutMain);
      var tRound = Math.round(tOriginal / stepFrame) * stepFrame;
      var key = tRound.toFixed(6) + "_L" + c.layer.index;
      var foundSlot = false;
      for (var idx = 0; idx < preferredTimesMain.length; idx++) {
        var tTry = Math.round(preferredTimesMain[idx] / stepFrame) * stepFrame;
        if (revealMinMain != null && isFinite(revealMinMain) && tTry < revealMinMain - 0.001) continue;
        if (tTry < layerInMain - 0.001 || tTry > layerOutMain + 0.001) continue;
        var kTry = tTry.toFixed(6) + "_L" + c.layer.index;
        if (!usedTime[kTry]) {
          tRound = tTry;
          key = kTry;
          foundSlot = true;
          break;
        }
      }
      if (!foundSlot) {
        while (usedTime[key] && (tRound + stepFrame <= layerOutMain + 0.001)) {
          tRound += stepFrame;
          key = tRound.toFixed(6) + "_L" + c.layer.index;
        }
        if (usedTime[key] && (tRound > layerOutMain + 0.001) && (tRound - stepFrame >= layerInMain - 0.001)) {
          tRound = Math.round(tOriginal / stepFrame) * stepFrame - stepFrame;
          var floorDedupe = layerInMain;
          if (revealMinMain != null && isFinite(revealMinMain) && revealMinMain > floorDedupe) floorDedupe = revealMinMain;
          while (tRound >= floorDedupe - 0.001) {
            key = tRound.toFixed(6) + "_L" + c.layer.index;
            if (!usedTime[key]) break;
            tRound -= stepFrame;
          }
        }
        key = tRound.toFixed(6) + "_L" + c.layer.index;
      }
      usedTime[key] = true;
      var shouldApplyNudge = (Math.abs(tRound - tOriginal) > 0.001);
      if (shouldApplyNudge) {
        c.best.t = tRound;
        var inRange = (tRound >= layerInMain - 0.001 && tRound <= layerOutMain + 0.001);
        if (inRange) {
          if (c.layerComp === comp) {
            var infoNudge = bboxForLayer(c.layer, c.layerComp, tRound);
            if (infoNudge && infoNudge.bbox && infoNudge.bbox.w >= 2 && infoNudge.bbox.h >= 2)
              c.best = { t: tRound, bbox: infoNudge.bbox, source: infoNudge.source || c.best.source };
            else
              c.best = { t: tRound, bbox: c.best.bbox, source: c.best.source };
          } else {
            var pathNudge = getPathToComp(comp, c.layerComp);
            var tPreNudge = tRound;
            for (var pj = 0; pj < pathNudge.length; pj++) tPreNudge -= Number(pathNudge[pj].layer.startTime || 0);
            var infoPre = bboxForLayer(c.layer, c.layerComp, tPreNudge);
            if (infoPre && infoPre.bbox && pathNudge.length > 0) {
              var bbPre = infoPre.bbox;
              var timesNudge = [tRound];
              for (var pk = 1; pk < pathNudge.length; pk++) timesNudge.push(timesNudge[timesNudge.length - 1] - (Number(pathNudge[pk - 1].layer.startTime) || 0));
              var cornersNudge = [[bbPre.x, bbPre.y], [bbPre.x + bbPre.w, bbPre.y], [bbPre.x + bbPre.w, bbPre.y + bbPre.h], [bbPre.x, bbPre.y + bbPre.h]];
              var mainCornersNudge = [];
              for (var pc = 0; pc < cornersNudge.length; pc++) {
                var ptN = cornersNudge[pc].slice();
                for (var pd = pathNudge.length - 1; pd >= 0; pd--) {
                  var trN = layerPointToCompAtTime(pathNudge[pd].layer, ptN, timesNudge[pd]);
                  if (!trN || trN.length < 2) break;
                  ptN = trN;
                }
                if (ptN && ptN.length >= 2) mainCornersNudge.push(ptN);
              }
              if (mainCornersNudge.length >= 2) {
                var minXN = mainCornersNudge[0][0], maxXN = mainCornersNudge[0][0], minYN = mainCornersNudge[0][1], maxYN = mainCornersNudge[0][1];
                for (var pe = 1; pe < mainCornersNudge.length; pe++) {
                  minXN = Math.min(minXN, mainCornersNudge[pe][0]); maxXN = Math.max(maxXN, mainCornersNudge[pe][0]);
                  minYN = Math.min(minYN, mainCornersNudge[pe][1]); maxYN = Math.max(maxYN, mainCornersNudge[pe][1]);
                }
                c.best = { t: tRound, bbox: { x: minXN, y: minYN, w: Math.max(2, maxXN - minXN), h: Math.max(2, maxYN - minYN) }, source: c.best.source };
              } else {
                c.best = { t: tRound, bbox: c.best.bbox, source: c.best.source };
              }
            } else {
              c.best = { t: tRound, bbox: c.best.bbox, source: c.best.source };
            }
          }
        } else {
          c.best = { t: tRound, bbox: c.best.bbox, source: c.best.source };
        }
      }
    }

    // One upload per text layer in layerComps (same text, same layer name, or duplicate stacks — all unique).
    function candidateForTextLayer(Lp, lcp) {
      var pid = makeStringKey(lcp, Lp);
      for (var cxi = 0; cxi < candidates.length; cxi++) {
        if (candidates[cxi].id === pid && candidates[cxi].layer === Lp) return candidates[cxi];
      }
      var preMp = (lcp !== comp) ? nestedMainByCompId[String(lcp.id)] : null;
      var bestP = tryScreenshotForTextLayer(Lp, lcp, comp, preMp);
      if (!bestP && lcp === comp) bestP = tryMainCompScreenshotForced(Lp, comp);
      if (!bestP && lcp !== comp) {
        bestP = tryNestedScreenshotFromPrecompTimes(Lp, lcp, comp, preMp);
        if (!bestP) bestP = tryNestedScreenshotFromPrecompTimes(Lp, lcp, comp, null);
      }
      if (!bestP) {
        var tMidP = (Number(Lp.inPoint || 0) + Number(Lp.outPoint || 0)) / 2;
        if (lcp === comp) bestP = buildMainCompScreenshotAtTime(Lp, comp, tMidP, "forced-layer-mid");
        else {
          var pathP = getPathToComp(comp, lcp);
          var tMainP = findMainTimeForPrecompLocalTime(pathP, tMidP, 0, comp.duration || 60, comp, lcp);
          if (tMainP != null) bestP = buildNestedScreenshotAtMainTime(Lp, lcp, comp, tMainP, "forced-layer-mid");
        }
      }
      if (!bestP) return null;
      var layerTextP = "";
      try { var spP = getSourceTextProp(Lp); if (spP) layerTextP = getCompletedTextForLayer(Lp, lcp); } catch (eTxtP) {}
      return { layer: Lp, layerComp: lcp, id: pid, best: bestP, layerText: layerTextP };
    }

    var uploadPlan = [];
    for (var lpi = 0; lpi < layerComps.length; lpi++) {
      var Lplan = layerComps[lpi].layer;
      var lcPlan = layerComps[lpi].comp;
      if (Lplan.matchName !== "ADBE Text Layer") continue;
      var candPlan = candidateForTextLayer(Lplan, lcPlan);
      if (!candPlan) {
        scanDebugLog("WARN: no screenshot plan for " + makeStringKey(lcPlan, Lplan));
        continue;
      }
      uploadPlan.push(candPlan);
    }

    var groups = {};
    var groupKeys = [];
    for (var g = 0; g < uploadPlan.length; g++) {
      var k = "u_" + g + "_" + uploadPlan[g].id;
      groups[k] = [uploadPlan[g]];
      groupKeys.push(k);
    }

    var stepFrameExport = comp.frameDuration || (1 / 24);
    if (!isFinite(stepFrameExport) || stepFrameExport <= 0) stepFrameExport = 1 / 24;
    scanDebugLog("Timeline Scan: " + uploadPlan.length + " screenshot upload(s) for " + layerComps.length + " text layer(s)");
    if (uploadPlan.length < layerComps.length) {
      scanDebugLog("WARN: " + (layerComps.length - uploadPlan.length) + " text layer(s) could not be scheduled (see Crowdin_layers_debug.txt)");
    }
    if (!uploadPlan.length) {
      setStatus("Timeline Scan: nothing to capture.");
      progressWithTime(0, layerComps.length, "Ready");
      alertIf(
        "No screenshots could be scheduled for any text layer.\n\n" +
        "Check that text layers are visible and on-screen in their comp (or precomp)."
      );
      return false;
    }

    // Ensure we export at a unique time per group so each string gets a different screenshot (even if dedupe assigned the same frame).
    // Use a spread step (e.g. 0.5s) so layers with same text/opacity don't get identical frames (one-frame nudge often looks the same).
    var exportSpreadSec = 0.5;
    var exportSpreadFrames = Math.max(1, Math.round(exportSpreadSec / stepFrameExport));
    var stepExportUnique = exportSpreadFrames * stepFrameExport;
    var compEndExport = 0;
    try { compEndExport = Number(comp.duration) || 0; } catch (e) {}
    var usedExportTime = {};
    var usedExportTimeByPrecomp = {};
    function uniqueExportTimeForGroup(bestT, groupIndex, layerInMain, layerOutMain, nestedPrecompShareKey, pinExportTime, aeLayerIndex) {
      var t = (pinExportTime != null && isFinite(pinExportTime))
        ? Math.round(pinExportTime / stepFrameExport) * stepFrameExport
        : Math.round(bestT / stepFrameExport) * stepFrameExport;
      if (t < 0) t = 0;
      var layerIn = (layerInMain != null && isFinite(layerInMain)) ? layerInMain : 0;
      var layerOut = (layerOutMain != null && isFinite(layerOutMain)) ? layerOutMain : (compEndExport > 0 ? compEndExport : 1e6);
      if (compEndExport > 0 && layerOut > compEndExport) layerOut = compEndExport;
      if (t < layerIn - 0.001 || t > layerOut + 0.001) {
        t = Math.max(layerIn, Math.min(layerOut, (layerIn + layerOut) / 2));
        t = Math.round(t / stepFrameExport) * stepFrameExport;
      }
      if (pinExportTime != null && isFinite(pinExportTime)) return t;
      if (nestedPrecompShareKey) {
        var preKey = nestedPrecompShareKey + "_L" + String(aeLayerIndex != null ? aeLayerIndex : groupIndex);
        var keyPre = t.toFixed(6) + "_L" + String(aeLayerIndex != null ? aeLayerIndex : groupIndex);
        while (usedExportTime[keyPre]) {
          t += stepExportUnique;
          t = Math.round(t / stepFrameExport) * stepFrameExport;
          if (t > layerOut + 0.001 && layerOut >= layerIn) t = layerIn;
          if (t < layerIn - 0.001) t = layerIn;
          keyPre = t.toFixed(6) + "_L" + String(aeLayerIndex != null ? aeLayerIndex : groupIndex);
        }
        usedExportTime[keyPre] = true;
        return t;
      }
      var key = t.toFixed(6) + "_L" + String(aeLayerIndex != null ? aeLayerIndex : groupIndex);
      while (usedExportTime[key]) {
        t += stepExportUnique;
        t = Math.round(t / stepFrameExport) * stepFrameExport;
        if (t > layerOut + 0.001 && layerOut >= layerIn) t = layerIn;
        if (t < layerIn - 0.001) t = layerIn;
        key = t.toFixed(6) + "_L" + String(aeLayerIndex != null ? aeLayerIndex : groupIndex);
      }
      usedExportTime[key] = true;
      return t;
    }

    var okCount = 0;
    var captured = 0;
    var scanUploadOkByStringId = {};
    var totalExportMs = 0;
    var totalUploadMs = 0;
    // Mac/Linux: one blocking curl per frame (parallel "( curl ) &" often truncates multipart through Cloudflare).
    var timelineSeqHttpCodes = [];
    var timelineSeqBodies = [];
    var timelineSeqCmds = [];
    var pngFilesToRemove = [];
    var boxesFilesToRemoveAll = [];
    var batFilesToRemove = [];
    var tFirstUploadStart = null;
    // UTF-8 fileKey attachment for multipart (Phrase/Crowdin scan-frame); avoids Windows/cmd mojibake and matches ae/strings key.
    var fkJsonForGroup = null;
    try {
      fkJsonForGroup = new File(tempPath("ct_fk_scan_" + safeScreenshotBase(STATE.fileKey || "comp") + ".json"));
      if (!fkJsonForGroup.exists) {
        writeTextFile(fkJsonForGroup, jsonStringifyMini({ fileKey: STATE.fileKey }));
      }
    } catch (eFkG) { fkJsonForGroup = null; }

    // Half res for Crowdin; Quarter for Phrase (faster uploads). AE divisor: 2 = Half, 4 = Quarter.
    var scanResDivisor = scanForceResolutionDivisor();
    var compResBefore = null;
    try { compResBefore = comp.resolutionFactor; } catch(eR0){}
    var scanResolutionFactor = 1 / scanResDivisor;
    try { comp.resolutionFactor = [scanResDivisor, scanResDivisor]; } catch(eR1){}
    var scanPngQuality = scanPngQualityForTms();

    // Warm server (e.g. Render.com cold start) so first scan-frame upload isn't slow. Skip when export-only (Windows single-batch).
    if (!(IS_WIN && exportOnlyCollector && typeof exportOnlyCollector.push === "function")) {
      try { curlGet(SERVER_BASE + "/"); } catch(eWarm){}
    }

    try {
    // Same scan rules on Mac and Windows: best frame, text-only (getTextLayersForExport), prefer Snapshot Marker, prefer second keyframe, unique time per layer; scale to 1080p + half resolution below.
    if ((typeof EXPORT_ONLY_AND_MANIFEST !== "undefined" && EXPORT_ONLY_AND_MANIFEST) || (IS_WIN && exportOnlyCollector && typeof exportOnlyCollector.push === "function")) {
      var manifest = [];
      var batchPngsToRemove = [];
      var batchBoxesToRemove = [];
      for (var gi = 0; gi < groupKeys.length; gi++) {
        var gk = groupKeys[gi];
        var group = groups[gk];
        setStatus("Timeline Scan: Export " + (gi + 1) + "/" + groupKeys.length + "...");
        if (setProgress) setProgress(gi, groupKeys.length, "Export " + (gi + 1) + "/" + groupKeys.length);
        try { app.refresh(); } catch (eEx) {}
        var first = group[0];
        var best = first.best;
        var TS = "" + (new Date().getTime()) + "_" + gi;
        var pngFile = new File(tempPath("ct_scan_" + TS + ".png"));
        var safeGroupKey = String(gk).replace(/[^\w.\-]+/g, "_");
        var layerInExp = 0, layerOutExp = compEndExport;
        if (first.layerComp === comp) {
          layerInExp = Math.max(0, Number(first.layer.inPoint) || 0);
          layerOutExp = Math.min(compEndExport, Math.max(0, Number(first.layer.outPoint) || compEndExport));
        } else {
          var pathOutE = getPathToComp(comp, first.layerComp);
          var nestedExp = getNestedTextMainTimeRange(first.layer, comp, pathOutE);
          layerInExp = nestedExp.layerInMain;
          layerOutExp = nestedExp.layerOutMain;
        }
        var nestedShareKey = (first.layerComp !== comp) ? ("nested_pc_" + String(first.layerComp.id)) : null;
        var pinExport = (getSnapshotMarkerTime(first.layer) != null) ? best.t : null;
        var tExport = uniqueExportTimeForGroup(best.t, gi, layerInExp, layerOutExp, nestedShareKey, pinExport, first.layer.index);
        try { comp.time = tExport; app.project.activeItem = comp; } catch (eForce) {}
        try { app.refresh(); } catch (ePre) {}
        scanDebugLog("Before export " + pngFile.fsName);
        var okPng = exportCompPngAtTime(comp, tExport, pngFile, true);
        if (!okPng) {
          try { app.refresh(); } catch (eRetry) {}
          okPng = exportCompPngAtTime(comp, tExport, pngFile, true);
        }
        scanDebugLog("After export exists=" + pngFile.exists + " size=" + (pngFile.exists && pngFile.length ? pngFile.length : 0));
        if (!okPng) { try { if (pngFile.exists) pngFile.remove(); } catch (e0) {} continue; }
        tryCompressPngForUpload(pngFile, scanPngQuality);
        var scale = scanResolutionFactor;
        var ssW = Math.round(comp.width * scale);
        var ssH = Math.round(comp.height * scale);
        var seenIdBatch = {};
        var allBoxesBatch = [];
        for (var bi = 0; bi < group.length; bi++) {
          var c = group[bi];
          if (seenIdBatch[c.id]) continue;
          seenIdBatch[c.id] = true;
          var bb = c.best.bbox;
          var bbExport = compBboxToExportBbox(bb, scale);
          allBoxesBatch.push(makeScanFrameBox(c, bbExport));
        }
        if (allBoxesBatch.length > 0) {
          var safeId = String(first.id).replace(/[^\w.\-]+/g, "_");
          var ssBaseBatch = safeScreenshotBase(STATE.fileKey) + "__" + safeGroupKey + "__" + safeId + "__t" + Math.round(tExport * 1000);
          var ssNameBatch = crowdinScreenshotName(ssBaseBatch);
          var fBoxesBatch = new File(tempPath("ct_boxes_" + TS + ".json"));
          writeTextFile(fBoxesBatch, jsonStringifyMini(allBoxesBatch));
          manifest.push({
            projectId: STATE.projectId,
            fileKey: STATE.fileKey,
            cultStringId: first.id,
            t: "" + Math.round(tExport * 1000),
            ssName: ssNameBatch,
            ssWidth: "" + ssW,
            ssHeight: "" + ssH,
            pngPath: pngFile.fsName,
            boxesPath: fBoxesBatch.fsName
          });
          batchBoxesToRemove.push(fBoxesBatch);
        }
        batchPngsToRemove.push(pngFile);
      }
      if (manifest.length === 0) {
        for (var i = 0; i < batchPngsToRemove.length; i++) try { if (batchPngsToRemove[i].exists) batchPngsToRemove[i].remove(); } catch(e){}
        for (var i = 0; i < batchBoxesToRemove.length; i++) try { if (batchBoxesToRemove[i].exists) batchBoxesToRemove[i].remove(); } catch(e){}
        setStatus("Timeline Scan: nothing to upload.");
        if (setProgress) setProgress(0, 0, "Ready");
        if (compResBefore && compResBefore.length === 2) try { comp.resolutionFactor = compResBefore; } catch(eR2){}
        return false;
      }
      if (IS_WIN && exportOnlyCollector && typeof exportOnlyCollector.push === "function") {
        for (var mi = 0; mi < manifest.length; mi++) exportOnlyCollector.push(manifest[mi]);
        setStatus("Timeline Scan: exported " + manifest.length + " frame(s) (Windows single-batch).");
        if (setProgress) setProgress(groupKeys.length, groupKeys.length, "Exported");
        if (compResBefore && compResBefore.length === 2) try { comp.resolutionFactor = compResBefore; } catch(eR2){}
        return true;
      }
      setStatus("Timeline Scan: uploading " + manifest.length + " item(s) in parallel...");
      if (setProgress) setProgress(groupKeys.length, groupKeys.length, "Uploading...");
      try { app.refresh(); } catch(e){}
      var uploadCommands = [];
      for (var mi = 0; mi < manifest.length; mi++) {
        var item = manifest[mi];
        var suffix = "batch_" + (new Date().getTime()) + "_" + mi;
        var fkJsonFile = new File(tempPath("ct_fk_scan_" + safeScreenshotBase(item.fileKey || STATE.fileKey) + ".json"));
        try {
          if (!fkJsonFile.exists) {
            writeTextFile(fkJsonFile, jsonStringifyMini({ fileKey: item.fileKey || STATE.fileKey }));
          }
        } catch (eFk) {}
        var one = curlPostMultipartBuild(
          EP_SCAN_FRAME,
          scanFrameUploadFields(item.projectId, item.fileKey, item.t, item.ssName, item.ssWidth, item.ssHeight, item.cultStringId, mi),
          [
            { name: "png", path: item.pngPath, mime: "image/png" },
            { name: "boxes", path: item.boxesPath, mime: "application/json" },
            { name: "fileKeyJson", path: fkJsonFile.fsName, mime: "application/json" }
          ],
          suffix
        );
        uploadCommands.push(one);
      }
      // Run manifest uploads sequentially instead of in parallel so that the
      // server processes each /ae/scan-frame in order for this comp/fileKey.
      var codes = [];
      var responseBodies = [];
      for (var mi = 0; mi < uploadCommands.length; mi++) {
        if (mi > 0) $.sleep(450);
        var oneCmd = uploadCommands[mi];
        scanDebugLog("Run batch upload " + mi + " (system.callSystem)");
        var code = "0";
        var body = "";
        for (var tryB = 0; tryB < 3; tryB++) {
          if (tryB > 0) $.sleep(900);
          var res = runParallelScanUploads([oneCmd], { keepBodies: true });
          var cArr = res.codes || res;
          var bArr = res.bodies || [];
          code = (cArr && cArr.length > 0) ? cArr[0] : "0";
          body = (bArr && bArr.length > 0) ? bArr[0] : "";
          if (code === "200") break;
        }
        codes.push(code);
        responseBodies.push(body);
      }
      var batchOkCount = 0;
      for (var h = 0; h < codes.length; h++) {
        if (codes[h] === "200") batchOkCount++;
      }
      for (var i = 0; i < batchPngsToRemove.length; i++) try { if (batchPngsToRemove[i].exists) batchPngsToRemove[i].remove(); } catch(e){}
      for (var i = 0; i < batchBoxesToRemove.length; i++) try { if (batchBoxesToRemove[i].exists) batchBoxesToRemove[i].remove(); } catch(e){}
      setStatus("Timeline Scan complete (batch) " + batchOkCount + "/" + manifest.length + " uploaded.");
      if (setProgress) setProgress(layerComps.length, layerComps.length, "Complete");
      if (compResBefore && compResBefore.length === 2) try { comp.resolutionFactor = compResBefore; } catch(eR2){}
      return batchOkCount > 0;
    }

    for (var gi = 0; gi < groupKeys.length; gi++) {
      var gk = groupKeys[gi];
      var group = groups[gk];
      setStatus("Timeline Scan: Screenshot " + (gi + 1) + "/" + groupKeys.length);
      if (setProgress) setProgress(gi, groupKeys.length, "Screenshot " + (gi + 1) + " of " + groupKeys.length);
      try { app.refresh(); } catch (eRefreshStart) {}
      var first = group[0];
      var best = first.best;
      captured += group.length;

      var TS = "" + (new Date().getTime()) + "_" + gi;
      var pngFile = new File(tempPath("ct_scan_" + TS + ".png"));
      var safeGroupKey = String(gk).replace(/[^\w.\-]+/g, "_");
      var safeId = String(first.id).replace(/[^\w.\-]+/g, "_");

      var layerInExp = 0, layerOutExp = compEndExport;
      if (first.layerComp === comp) {
        layerInExp = Math.max(0, Number(first.layer.inPoint) || 0);
        layerOutExp = Math.min(compEndExport, Math.max(0, Number(first.layer.outPoint) || compEndExport));
      } else {
        var pathOutE = getPathToComp(comp, first.layerComp);
        var nestedExp2 = getNestedTextMainTimeRange(first.layer, comp, pathOutE);
        layerInExp = nestedExp2.layerInMain;
        layerOutExp = nestedExp2.layerOutMain;
      }
      var nestedShareKey2 = (first.layerComp !== comp) ? ("nested_pc_" + String(first.layerComp.id)) : null;
      var pinExport2 = (getSnapshotMarkerTime(first.layer) != null) ? best.t : null;
      var tExport = uniqueExportTimeForGroup(best.t, gi, layerInExp, layerOutExp, nestedShareKey2, pinExport2, first.layer.index);
      try { comp.time = tExport; app.project.activeItem = comp; } catch (eForce) {}
      var tExport0 = (new Date()).getTime();
      scanDebugLog("Before export " + pngFile.fsName + " layer=" + safeId);
      var okPng = exportCompPngAtTime(comp, tExport, pngFile, true);
      if (!okPng) {
        try { comp.time = Math.max(layerInExp, tExport - stepFrameExport); } catch (eRetryT) {}
        okPng = exportCompPngAtTime(comp, tExport, pngFile, true);
      }
      var tExport1 = (new Date()).getTime();
      scanDebugLog("After export exists=" + pngFile.exists + " size=" + (pngFile.exists && pngFile.length ? pngFile.length : 0) + " layer=" + safeId);
      if (!okPng) {
        scanDebugLog("WARN: PNG export failed for " + safeId + " at t=" + tExport);
        try { if (pngFile.exists) pngFile.remove(); } catch (e0) {}
        continue;
      }
      tryCompressPngForUpload(pngFile, scanPngQuality);
      var scale = scanResolutionFactor;
      var ssW = Math.round(comp.width * scale);
      var ssH = Math.round(comp.height * scale);

      var seenId = {};
      var allBoxesFrame = [];
      for (var bi = 0; bi < group.length; bi++) {
        var c = group[bi];
        if (seenId[c.id]) continue;
        seenId[c.id] = true;
        var bb = c.best.bbox;
        var bbExport = compBboxToExportBbox(bb, scale);
        allBoxesFrame.push(makeScanFrameBox(c, bbExport));
      }
      var uploadCommands = [];
      var boxesFilesToRemove = [];
      if (allBoxesFrame.length > 0) {
        var ssBaseFrame = safeScreenshotBase(STATE.fileKey) + "__" + safeGroupKey + "__" + safeId + "__t" + Math.round(tExport * 1000);
        var ssNameFrame = crowdinScreenshotName(ssBaseFrame);
        var fBoxes = new File(tempPath("ct_boxes_" + TS + ".json"));
        writeTextFile(fBoxes, jsonStringifyMini(allBoxesFrame));
        boxesFilesToRemove.push(fBoxes);
        var one = curlPostMultipartBuild(
          EP_SCAN_FRAME,
          scanFrameUploadFields(STATE.projectId, STATE.fileKey, "" + Math.round(tExport * 1000), ssNameFrame, "" + ssW, "" + ssH, first.id, gi),
          [
            { name: "png", path: pngFile.fsName, mime: "image/png" },
            { name: "boxes", path: fBoxes.fsName, mime: "application/json" }
          ].concat(fkJsonForGroup && fkJsonForGroup.exists ? [{ name: "fileKeyJson", path: fkJsonForGroup.fsName, mime: "application/json" }] : []),
          TS + "_layer"
        );
        uploadCommands.push(one);
      }

      if (uploadCommands.length > 0) {
        scanDebugLog("Before upload layer=" + safeId + " png=" + pngFile.fsName);
        for (var ui = 0; ui < uploadCommands.length; ui++) {
          if (tFirstUploadStart === null) tFirstUploadStart = (new Date()).getTime();
          if (gi > 0 || ui > 0) $.sleep(450);
          var seqCmdObj = uploadCommands[ui];
          var codeSq = "0";
          var bodySq = "";
          for (var tryUp = 0; tryUp < 3; tryUp++) {
            if (tryUp > 0) $.sleep(900);
            var resSq = runParallelScanUploads([seqCmdObj], { keepBodies: true });
            var cSq = resSq.codes || resSq;
            var bSq = resSq.bodies || [];
            codeSq = (cSq && cSq.length > 0) ? cSq[0] : "0";
            bodySq = (bSq && bSq.length > 0) ? bSq[0] : "";
            if (codeSq === "200") break;
            var bodyLo = (bodySq || "").toLowerCase();
            if (bodyLo.indexOf("multipart") < 0 && bodyLo.indexOf("server_error") < 0 && codeSq !== "0" && codeSq !== "500") break;
          }
          timelineSeqHttpCodes.push(codeSq);
          timelineSeqBodies.push(bodySq);
          timelineSeqCmds.push(seqCmdObj);
          if (codeSq === "200") scanUploadOkByStringId[first.id] = true;
        }
        pngFilesToRemove.push(pngFile);
        for (var br = 0; br < boxesFilesToRemove.length; br++) boxesFilesToRemoveAll.push(boxesFilesToRemove[br]);
      } else {
        try { if (pngFile.exists) pngFile.remove(); } catch (e0) {}
      }

      totalExportMs += (tExport1 - tExport0);
      setStatus("Timeline Scan: Screenshot " + (gi + 1) + "/" + groupKeys.length + " (upload finished)");
      try { app.refresh(); } catch (eRefresh) {}
    }

    // One scan-frame per AE text layer (duplicate text / identical layer names must not share a single upload).
    var candByIdGuarantee = {};
    for (var gci = 0; gci < candidates.length; gci++) candByIdGuarantee[candidates[gci].id] = candidates[gci];
    for (var gxi = 0; gxi < layerComps.length; gxi++) {
      var Lgx = layerComps[gxi].layer;
      var lcGx = layerComps[gxi].comp;
      if (Lgx.matchName !== "ADBE Text Layer") continue;
      var sidGx = makeStringKey(lcGx, Lgx);
      if (scanUploadOkByStringId[sidGx]) continue;
      var candGx = candByIdGuarantee[sidGx];
      if (!candGx) {
        var preGx = (lcGx !== comp) ? nestedMainByCompId[String(lcGx.id)] : null;
        var bestGx = tryScreenshotForTextLayer(Lgx, lcGx, comp, preGx);
        if (!bestGx) {
          scanDebugLog("WARN: guarantee upload skipped (no screenshot time) " + sidGx);
          continue;
        }
        candGx = { layer: Lgx, layerComp: lcGx, id: sidGx, best: bestGx, layerText: "" };
        try { var spGx = getSourceTextProp(Lgx); if (spGx) candGx.layerText = getCompletedTextForLayer(Lgx, lcGx); } catch (eGxTxt) {}
      }
      setStatus("Timeline Scan: extra screenshot for " + sidGx + "…");
      var TSg = "" + (new Date()).getTime() + "_guar_" + gxi;
      var pngFileG = new File(tempPath("ct_scan_" + TSg + ".png"));
      var layerInGx = 0, layerOutGx = compEndExport;
      if (candGx.layerComp === comp) {
        layerInGx = Math.max(0, Number(candGx.layer.inPoint) || 0);
        layerOutGx = Math.min(compEndExport, Math.max(0, Number(candGx.layer.outPoint) || compEndExport));
      } else {
        var pathGx = getPathToComp(comp, candGx.layerComp);
        var nestedGx = getNestedTextMainTimeRange(candGx.layer, comp, pathGx);
        layerInGx = nestedGx.layerInMain;
        layerOutGx = nestedGx.layerOutMain;
      }
      var nestedShareGx = (candGx.layerComp !== comp) ? ("nested_pc_" + String(candGx.layerComp.id)) : null;
      var pinGx = (getSnapshotMarkerTime(candGx.layer) != null) ? candGx.best.t : null;
      var tExportG = uniqueExportTimeForGroup(candGx.best.t, 9000 + gxi, layerInGx, layerOutGx, nestedShareGx, pinGx, candGx.layer.index);
      try { comp.time = tExportG; app.project.activeItem = comp; } catch (eForceG) {}
      var okPngG = exportCompPngAtTime(comp, tExportG, pngFileG, true);
      if (!okPngG) okPngG = exportCompPngAtTime(comp, tExportG, pngFileG, true);
      if (!okPngG) {
        scanDebugLog("WARN: guarantee PNG export failed " + sidGx);
        try { if (pngFileG.exists) pngFileG.remove(); } catch (eRmG) {}
        continue;
      }
      tryCompressPngForUpload(pngFileG, scanPngQuality);
      var scaleG = scanResolutionFactor;
      var ssWG = Math.round(comp.width * scaleG);
      var ssHG = Math.round(comp.height * scaleG);
      var bbG = candGx.best.bbox;
      var bbExportG = compBboxToExportBbox(bbG, scaleG);
      var boxesG = [makeScanFrameBox(candGx, bbExportG)];
      var safeIdG = String(candGx.id).replace(/[^\w.\-]+/g, "_");
      var ssBaseG = safeScreenshotBase(STATE.fileKey) + "__guar__L" + candGx.layer.index + "__" + safeIdG + "__t" + Math.round(tExportG * 1000);
      var ssNameG = crowdinScreenshotName(ssBaseG);
      var fBoxesG = new File(tempPath("ct_boxes_" + TSg + ".json"));
      writeTextFile(fBoxesG, jsonStringifyMini(boxesG));
      var oneG = curlPostMultipartBuild(
        EP_SCAN_FRAME,
        scanFrameUploadFields(STATE.projectId, STATE.fileKey, "" + Math.round(tExportG * 1000), ssNameG, "" + ssWG, "" + ssHG, candGx.id, gxi),
        [
          { name: "png", path: pngFileG.fsName, mime: "image/png" },
          { name: "boxes", path: fBoxesG.fsName, mime: "application/json" }
        ].concat(fkJsonForGroup && fkJsonForGroup.exists ? [{ name: "fileKeyJson", path: fkJsonForGroup.fsName, mime: "application/json" }] : []),
        TSg + "_guar"
      );
      $.sleep(450);
      var codeG = "0";
      for (var tryGu = 0; tryGu < 3; tryGu++) {
        if (tryGu > 0) $.sleep(900);
        var resGu = runParallelScanUploads([oneG], { keepBodies: true });
        var cGu = resGu.codes || resGu;
        codeG = (cGu && cGu.length > 0) ? cGu[0] : "0";
        if (codeG === "200") break;
      }
      timelineSeqHttpCodes.push(codeG);
      timelineSeqCmds.push(oneG);
      if (codeG === "200") {
        scanUploadOkByStringId[sidGx] = true;
        scanDebugLog("Guarantee upload ok " + sidGx);
      } else {
        scanDebugLog("WARN: guarantee upload HTTP " + codeG + " for " + sidGx);
      }
      try { if (pngFileG.exists) pngFileG.remove(); } catch (ePg) {}
      try { if (fBoxesG.exists) fBoxesG.remove(); } catch (eBg) {}
    }

    } finally {
      if (compResBefore && compResBefore.length === 2) {
        try { comp.resolutionFactor = compResBefore; } catch(eR2){}
      }
    }

    if (timelineSeqHttpCodes.length > 0) {
      setStatus("Timeline Scan: Finishing uploads…");
      scanDebugLog("Sequential scan uploads done, processing " + timelineSeqHttpCodes.length + " responses");
      var httpCodes = timelineSeqHttpCodes;
      var responseBodies = timelineSeqBodies;
      // Retry all 500s in one parallel batch (one short delay), same as previous background path.
      if (timelineSeqCmds.length === httpCodes.length) {
        var retryCommands = [];
        var retryIndices = [];
        for (var ri = 0; ri < httpCodes.length; ri++) {
          if (httpCodes[ri] === "500") {
            retryCommands.push(timelineSeqCmds[ri]);
            retryIndices.push(ri);
          }
        }
        if (retryCommands.length > 0) {
          $.sleep(300);
          var retryRes = runParallelScanUploads(retryCommands, { keepBodies: true });
          var retryCodes = retryRes.codes || retryRes;
          var retryBodies = retryRes.bodies || [];
          for (var rj = 0; rj < retryIndices.length; rj++) {
            if (retryCodes[rj] === "200") {
              httpCodes[retryIndices[rj]] = "200";
              if (retryBodies[rj] != null) responseBodies[retryIndices[rj]] = retryBodies[rj];
            }
          }
        }
      }
      var tAllUploadsDone = (new Date()).getTime();
      if (tFirstUploadStart !== null) totalUploadMs = tAllUploadsDone - tFirstUploadStart;
      for (var h = 0; h < httpCodes.length; h++) {
        if (httpCodes[h] === "200") okCount++;
      }
      for (var b = 0; b < boxesFilesToRemoveAll.length; b++) {
        try { if (boxesFilesToRemoveAll[b].exists) boxesFilesToRemoveAll[b].remove(); } catch(eB){}
      }
      for (var p = 0; p < pngFilesToRemove.length; p++) {
        try { if (pngFilesToRemove[p].exists) pngFilesToRemove[p].remove(); } catch(eP){}
      }
      for (var bf = 0; bf < batFilesToRemove.length; bf++) {
        try { if (batFilesToRemove[bf].exists) batFilesToRemove[bf].remove(); } catch(eBf){}
      }
    }

    var totalExportS = (totalExportMs / 1000).toFixed(1);
    var totalUploadS = (totalUploadMs / 1000).toFixed(1);
    var textLayersExported = 0;
    for (var tlc = 0; tlc < layerComps.length; tlc++) {
      if (layerComps[tlc].layer.matchName === "ADBE Text Layer") textLayersExported++;
    }
    setStatus("Timeline Scan complete. " + okCount + "/" + uploadPlan.length + " screenshot(s) uploaded.");
    if (setProgress) setProgress(layerComps.length, layerComps.length, "Complete");
    return okCount > 0;
  } finally {
    if (scaleFactorApplied) { try { scaleCompositionByFactor(comp, 1 / scaleFactorApplied); } catch(eRestore){} }
  }
  }

  function lookupTranslatedTextForKey(map, key) {
    if (!map || !key) return null;
    if (map[key] != null && String(map[key]).replace(/^\s+|\s+$/g, "").length > 0) {
      return String(map[key]);
    }
    var best = "";
    var prefix = String(key);
    for (var k in map) {
      if (!map.hasOwnProperty(k)) continue;
      if (k === prefix || k.indexOf(prefix + "_") === 0 || k.indexOf(prefix + ":") === 0) {
        var t = String(map[k] == null ? "" : map[k]).replace(/^\s+|\s+$/g, "");
        if (t.length > best.length) best = String(map[k]);
      }
    }
    return best.length ? best : null;
  }

  function trimImportText(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
  }

  function compNameExistsInProject(name) {
    try {
      for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it && it instanceof CompItem && String(it.name) === name) return true;
      }
    } catch (e) {}
    return false;
  }

  function uniqueCompNameInProject(base) {
    var name = String(base || "Comp").replace(/^\s+|\s+$/g, "");
    if (!name.length) name = "Comp";
    if (!compNameExistsInProject(name)) return name;
    for (var n = 2; n < 10000; n++) {
      var tryName = name + " " + n;
      if (!compNameExistsInProject(tryName)) return tryName;
    }
    return name + "_" + (new Date().getTime());
  }

  /**
   * After duplicating the main comp, replace each nested precomp layer with its own duplicate
   * so translations in [main]_[lang] do not change shared source precomps.
   * dupMap: original CompItem.id → duplicated CompItem (one duplicate per source precomp).
   */
  function duplicateNestedPrecompSources(comp, dupMap, langPart) {
    dupMap = dupMap || {};
    if (!comp || !(comp instanceof CompItem)) return dupMap;
    for (var i = 1; i <= comp.numLayers; i++) {
      var L = null;
      try { L = comp.layer(i); } catch (eL) { continue; }
      if (!L || !L.source || !(L.source instanceof CompItem)) continue;
      var src = L.source;
      var sid = src.id;
      if (!dupMap[sid]) {
        try {
          dupMap[sid] = src.duplicate();
          if (langPart) {
            var base = String(src.name != null ? src.name : "Precomp").replace(/^\s+|\s+$/g, "");
            if (!base.length) base = "Precomp";
            dupMap[sid].name = uniqueCompNameInProject(base + "_" + langPart);
          }
          duplicateNestedPrecompSources(dupMap[sid], dupMap, langPart);
        } catch (eDup) { continue; }
      }
      try { L.replaceSource(dupMap[sid], false); } catch (eRep) {}
    }
    return dupMap;
  }

  // Import translations: duplicate source comp, name as [comp name]_[language], apply translations to the new comp.
  // Pair layers with the same export order as collectText (incl. precomps) using original comp ids for map keys.
  function applyTranslationsToComp(dupComp, map, originalComp) {
    var updated = 0;
    var dupByPath = {};
    var dupList = getTextLayersForExport(dupComp);
    for (var d = 0; d < dupList.length; d++) {
      var pk = makeLayerStablePathKey(dupComp, dupList[d].comp, dupList[d].layer);
      if (pk) dupByPath[pk] = dupList[d].layer;
    }
    var origList = getTextLayersForExport(originalComp);
    for (var i = 0; i < origList.length; i++) {
      var key = makeStringKey(origList[i].comp, origList[i].layer);
      var translated = lookupTranslatedTextForKey(map, key);
      if (translated == null) continue;
      translated = trimImportText(translated);
      if (!translated.length) continue;
      var pkOrig = makeLayerStablePathKey(originalComp, origList[i].comp, origList[i].layer);
      var dupLayer = pkOrig ? dupByPath[pkOrig] : null;
      if (!dupLayer) continue;
      var sp = getSourceTextProp(dupLayer);
      if (!sp) continue;
      var savedName = "";
      try { savedName = String(dupLayer.name || ""); } catch (eName) {}
      var doc = sp.value;
      doc.text = translated;
      sp.setValue(doc);
      try { if (savedName.length) dupLayer.name = savedName; } catch (eName2) {}
      updated++;
    }
    return updated;
  }

  function importText(sourceComp, langId, setStatus, langDisplayName, pullItemsOpt){
    langId = trim(langId||"");
    if (!langId) return false;
    if (!sourceComp || !(sourceComp instanceof CompItem)) return false;

    if (!STATE.projectId) { alertIf("Select a project first."); return false; }
    var fileKey = safeFileKeyForComp(sourceComp);

    setStatus("Importing (" + String(langId).toUpperCase() + ")…");

    var items = [];
    if (pullItemsOpt && pullItemsOpt.length) {
      items = pullItemsOpt;
    } else {
      var body = '{' +
        '"projectId":"' + jsonEscape(STATE.projectId) + '",' +
        '"fileKey":"' + jsonEscape(fileKey) + '",' +
        '"targetLang":"' + jsonEscape(langId) + '"' +
      '}';

      var r = curlPostJson(EP_PULL, body);
      if (r.http !== "200") {
        setStatus("Import failed.");
        alertIf("Pull failed.\nHTTP " + r.http + "\n\n" + (r.body||""));
        return false;
      }

      items = parsePullItems(r.body);
      if (!items.length && TMS_PROVIDER !== "phrase") {
        setStatus("Invalid pull response.");
        alertIf("Invalid pull response:\n\n" + (r.body||""));
        return false;
      }
    }

    var map = {};
    for (var i=0;i<items.length;i++) map[items[i].id] = items[i].translatedText;

    var compNameBase = (sourceComp.name != null && String(sourceComp.name).replace(/^\s+|\s+$/g, "").length > 0)
      ? String(sourceComp.name).replace(/^\s+|\s+$/g, "")
      : "Comp";
    var langPart = (langDisplayName != null && String(langDisplayName).replace(/^\s+|\s+$/g, "").length > 0)
      ? String(langDisplayName).replace(/^\s+|\s+$/g, "")
      : langId;
    var nameForComp = compNameBase + "_" + langPart;

    app.beginUndoGroup(tmsBrandName() + " Import: " + nameForComp);

    var newComp;
    try {
      newComp = sourceComp.duplicate();
    } catch (e) {
      app.endUndoGroup();
      setStatus("Duplicate failed.");
      alertIf("Could not duplicate composition.\n" + (e.message || e));
      return false;
    }

    newComp.name = uniqueCompNameInProject(nameForComp);
    duplicateNestedPrecompSources(newComp, {}, langPart);
    var updated = applyTranslationsToComp(newComp, map, sourceComp);

    app.endUndoGroup();

    var msg = "Imported " + updated + " layers into \"" + newComp.name + "\".";
    if (updated === 0 && items.length > 0) {
      msg = "Created \"" + newComp.name + "\" (no translated text applied — layers kept source language).";
    } else if (updated < items.length && items.length > 0) {
      msg = "Imported " + updated + " of " + items.length + " strings into \"" + newComp.name + "\" (untranslated layers kept source language).";
    }
    setStatus(msg);
    return true;
  }

  // UI (Collect triggers scan)
  // ScriptUI: uses native controls (Mac/Windows). helpTip on controls aids accessibility; labels before controls support screen readers. For localization, move UI strings to a single table.
  function buildUI(thisObj){
    var panelTitle = "Cult Connector (AE ↔ TMS)";
    var pal = (thisObj instanceof Panel)
      ? thisObj
      : new Window("palette", panelTitle, undefined, {resizeable:true});

    // Fixed content width when run as Script UI panel (AE): avoids layout shift, dropdown stretch, margin changes on resize.
    var IS_PANEL = (thisObj instanceof Panel);
    var CONTENT_W = IS_PANEL ? 300 : -1;

    pal.orientation = "column";
    pal.alignChildren = IS_PANEL ? ["left", "top"] : ["fill", "fill"];
    pal.margins = [8, 0, 8, 8];
    pal.spacing = 4;
    if (IS_PANEL) {
      pal.preferredSize = [-1, -1];
    } else {
      pal.preferredSize = [320, 280];
    }
    if (pal instanceof Window) {
      pal.minimumSize = [280, 180];
    }
    // Resize: only resize(), not layout(true), to avoid resetting alignment/sizes (AE panel best practice).
    pal.onResizing = pal.onResize = function() {
      try { pal.layout.resize(); } catch (e) {}
    };

    // ---------- Onboarding (Connect → Choose project); hidden once main panel is active ----------
    // Use a stack so onboarding and main share one slot: content is centered, window has one content height.
    var contentStack = pal.add("group");
    contentStack.orientation = "stack";
    contentStack.alignChildren = ["fill", "fill"];
    contentStack.preferredSize = CONTENT_W > 0 ? [CONTENT_W, -1] : [-1, -1];

    var onboardingGroup = contentStack.add("group");
    onboardingGroup.orientation = "column";
    onboardingGroup.alignChildren = ["center", "center"];
    onboardingGroup.spacing = 0;
    onboardingGroup.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 260] : [-1, 260];

    var onboardingPanel = onboardingGroup.add("panel", undefined, "Sign in");
    onboardingPanel.orientation = "column";
    onboardingPanel.alignChildren = ["center", "center"];
    // Add a bit more top padding between the panel title and the \"Sign in\" subtitle.
    onboardingPanel.margins = [8, 14, 8, 8];
    onboardingPanel.spacing = 8;
    onboardingPanel.preferredSize = CONTENT_W > 0 ? [CONTENT_W, -1] : [340, -1];
    onboardingPanel.alignment = ["center", "center"];

    var stepStack = onboardingPanel.add("group");
    stepStack.orientation = "stack";
    stepStack.alignChildren = ["center", "center"];

    var TMS_ONBOARD_CHOICE = "";
    var step0Group = stepStack.add("group");
    step0Group.orientation = "column";
    step0Group.alignChildren = ["fill", "top"];
    step0Group.spacing = 8;
    step0Group.alignment = ["fill", "center"];
    var step0PickRow = step0Group.add("group");
    step0PickRow.orientation = "row";
    step0PickRow.alignChildren = ["fill", "center"];
    step0PickRow.alignment = ["fill", "top"];
    step0PickRow.spacing = 6;
    var ddTmsSelect = step0PickRow.add("dropdownlist", undefined, ["Select", "Crowdin", "Phrase"]);
    ddTmsSelect.preferredSize = [CONTENT_W > 0 ? CONTENT_W - 16 : 260, 24];
    ddTmsSelect.alignment = ["fill", "center"];
    ddTmsSelect.selection = 0;
    var step0OkRow = step0Group.add("group");
    step0OkRow.orientation = "row";
    step0OkRow.alignChildren = ["right", "center"];
    step0OkRow.alignment = ["fill", "top"];
    var btnTmsStep0OK = createFlatButton(step0OkRow, "OK", "Continue with the selected TMS.", 24);
    var btnTmsStep0Cancel = createFlatButton(step0OkRow, "Cancel", null, 24);

    var step1Group = stepStack.add("group");
    step1Group.orientation = "column";
    step1Group.alignChildren = ["fill", "top"];
    step1Group.spacing = 8;
    step1Group.alignment = ["fill", "center"];
    var step1TopRow = step1Group.add("group");
    step1TopRow.orientation = "row";
    step1TopRow.alignChildren = ["left", "center"];
    step1TopRow.alignment = ["fill", "top"];
    var btnBackToTmsPicker = createFlatButton(step1TopRow, "\u2190 Change TMS", "Go back and choose Crowdin or Phrase.", 24);
    btnBackToTmsPicker.preferredSize = [110, 24];
    var step1BtnRow = step1Group.add("group");
    // Stack connect buttons vertically so each has full width and uncropped highlight on macOS/Windows.
    step1BtnRow.orientation = "column";
    step1BtnRow.alignChildren = ["fill", "top"];
    step1BtnRow.alignment = ["fill", "top"];
    step1BtnRow.spacing = 6;
    var btnConnectTeam = createFlatButton(step1BtnRow, "Crowdin", "Connect to crowdin.com (Teams plans).", 28);
    var btnConnectEnterprise = createFlatButton(step1BtnRow, "Crowdin Enterprise", "Connect to Crowdin Enterprise.", 28);

    var step2Group = stepStack.add("group");
    step2Group.orientation = "column";
    step2Group.alignChildren = ["fill", "top"];
    step2Group.spacing = 8;
    step2Group.alignment = ["fill", "center"];
    var step2Row = step2Group.add("group");
    step2Row.orientation = "row";
    step2Row.alignChildren = ["fill", "center"];
    step2Row.alignment = ["fill", "top"];
    var ddOnboardProjects = step2Row.add("dropdownlist", undefined, []);
    ddOnboardProjects.preferredSize = [260, 24];
    var step2BtnRow = step2Group.add("group");
    step2BtnRow.orientation = "row";
    step2BtnRow.alignChildren = ["right", "center"];
    step2BtnRow.alignment = ["fill", "top"];
    var btnOnboardOK = createFlatButton(step2BtnRow, "OK", null, 24);
    var btnOnboardCancel = createFlatButton(step2BtnRow, "Cancel", null, 24);
    step2Group.visible = false;
    step1Group.visible = false;

    function showOnboardingStep0() {
      onboardingPanel.text = "Choose TMS";
      step0Group.visible = true;
      step1Group.visible = false;
      step2Group.visible = false;
      TMS_ONBOARD_CHOICE = "";
      try { ddTmsSelect.selection = 0; } catch (eDd0) {}
      setStatus("Select a TMS (Crowdin or Phrase), then click OK.");
    }

    function showOnboardingStep1Connect() {
      onboardingPanel.text = "Sign in - Crowdin";
      step0Group.visible = false;
      step1Group.visible = true;
      step2Group.visible = false;
      setStatus("Choose Crowdin or Crowdin Enterprise.");
    }

    btnBackToTmsPicker.onClick = function() {
      showOnboardingStep0();
      try { pal.layout.layout(true); } catch (eBack) {}
    };

    btnTmsStep0OK.onClick = function() {
      var sel = ddTmsSelect.selection;
      var label = (sel && sel.text) ? String(sel.text) : "";
      if (label === "Select" || !label.length) {
        alertIf("Select Crowdin or Phrase from the menu.");
        return;
      }
      if (label === "Crowdin") {
        TMS_ONBOARD_CHOICE = "crowdin";
        showOnboardingStep1Connect();
      } else if (label === "Phrase") {
        TMS_ONBOARD_CHOICE = "phrase";
        setTmsProvider("phrase");
        if (cbSegmentation) {
          cbSegmentation.value = true;
          STATE.useSegmentation = true;
        }
        updateTmsUiLabels();
        if (isPhraseAlreadyConnected()) {
          if (phraseOnboardContinueFromServer(true)) return;
          setStatus("Phrase connected — click OK again to reload projects.");
          return;
        }
        doOauthThenProjects("phrase");
      }
      try { pal.layout.layout(true); } catch (eOk) {}
    };

    btnTmsStep0Cancel.onClick = function() {
      try { ddTmsSelect.selection = 0; } catch (eCx) {}
      setStatus("Select a TMS (Crowdin or Phrase), then click OK.");
    };

    // ---------- Main panel (Pages + Settings tabs); shown after onboarding complete ----------
    var mainGroup = contentStack.add("group");
    mainGroup.orientation = "column";
    mainGroup.alignChildren = ["fill", "fill"];
    mainGroup.preferredSize = CONTENT_W > 0 ? [CONTENT_W, -1] : [-1, -1];

    var tabs = mainGroup.add("tabbedpanel");
    tabs.alignChildren = ["fill", "fill"];
    tabs.preferredSize = CONTENT_W > 0 ? [CONTENT_W, -1] : [-1, -1];
    tabs.margins = [8, 0, 8, 0];

    var tabComposition = tabs.add("tab", undefined, "Composition");
    var tabSettings = tabs.add("tab", undefined, "Settings");

    function setStatus(s){
      if (typeof progressLabel !== "undefined") progressLabel.text = (s && s.length > 0) ? s : "Ready";
      try { pal.layout.resize(); } catch (e) {}
    }

    // (Legacy bottom progress bar removed in favor of popup progress.)
    var progressLabel = { text: "Ready" };

    function setProgress(current, total, message){
      // No-op: progress now shown in popup only.
    }

    tabComposition.orientation = "column";
    tabComposition.alignChildren = ["fill", "fill"];
    tabComposition.preferredSize = CONTENT_W > 0 ? [CONTENT_W, -1] : [-1, -1];
    tabComposition.margins = [8, 4, 8, 8];
    tabComposition.spacing = 6;

    // Snapshot Marker: small square only, top right below tab names. Single child + right alignment = no full-width spacer (per Adobe layout).
    var rowSnapshot = tabComposition.add("group");
    rowSnapshot.orientation = "row";
    rowSnapshot.alignChildren = ["right", "center"];
    rowSnapshot.alignment = ["fill", "top"];
    rowSnapshot.preferredSize = [-1, 22];
    rowSnapshot.minimumSize = [-1, 22];
    var btnSnapshotMarker = createFlatButton(rowSnapshot, "\u25B2", "Snapshot Marker - Select one or more text layers (main comp or precomp), set the playhead to the desired frame, then click to set Smart Scan screenshot time.", 22);
    // Force a compact square button (same width/height).
    btnSnapshotMarker.preferredSize = [22, 22];
    btnSnapshotMarker.minimumSize = [22, 22];
    btnSnapshotMarker.alignment = ["right", "center"];
    var snapshotMarkerMsg = "Snapshot Marker - Select one or more text layers, set the playhead to the desired frame on the timeline, then click to set as the preferred time for Smart Scan.";
    var snapshotMarkerWrongLayerMsg = "Select at least one text layer in this composition. Set the playhead to the desired frame, then click the Snapshot Marker button.";
    btnSnapshotMarker.onClick = function() {
      var comp = app.project && app.project.activeItem;
      if (!comp || !(comp instanceof CompItem)) {
        alertIf(snapshotMarkerMsg);
        return;
      }
      var sel = comp.selectedLayers;
      if (!sel || sel.length < 1) {
        alertIf(snapshotMarkerMsg);
        return;
      }
      var textLayers = [];
      for (var si = 0; si < sel.length; si++) {
        if (sel[si] && sel[si].matchName === "ADBE Text Layer") textLayers.push(sel[si]);
      }
      if (!textLayers.length) {
        alertIf(snapshotMarkerWrongLayerMsg);
        return;
      }
      var t = comp.time;
      var ok = 0;
      var fail = 0;
      for (var ti = 0; ti < textLayers.length; ti++) {
        if (setSnapshotMarkerAtTime(textLayers[ti], t)) ok++;
        else fail++;
      }
      if (ok > 0) {
        var msg = (ok === 1)
          ? "Snapshot marker set at current time."
          : ("Snapshot markers set on " + ok + " text layers at current time.");
        if (fail > 0) msg += " (" + fail + " failed)";
        if (typeof setStatus === "function") setStatus(msg);
        else alertIf(msg);
      } else {
        alertIf("Could not add the marker" + (textLayers.length > 1 ? "s" : "") + ".");
      }
    };

    var spacerBeforeExport = tabComposition.add("group");
    spacerBeforeExport.preferredSize = [-1, 1];

    // Action buttons stack: Export then Import.
    var rowMainBtns = tabComposition.add("group");
    rowMainBtns.orientation = "column";
    rowMainBtns.alignChildren = ["fill", "top"];
    rowMainBtns.alignment = ["fill", "top"];
    rowMainBtns.spacing = 12;
    var btnWidth = 220;
    var btnHeight = 26;
    var exportLabel = rowMainBtns.add("statictext", undefined, "After Effects \u2192 Crowdin");
    exportLabel.alignment = ["center", "top"];
    exportLabel.graphics = exportLabel.graphics || {};
    try { exportLabel.graphics.font = ScriptUI.newFont(exportLabel.graphics.font.name, ScriptUI.FontStyle.PLAIN, 11); } catch(e) {}

    var btnSendCompositions = createFlatButton(rowMainBtns, "Send Selected Compositions", "Export selected compositions to Crowdin for the chosen target language(s).", btnHeight);

    var spacerAfterSend = rowMainBtns.add("group");
    spacerAfterSend.preferredSize = [-1, 5];

    // Separator line centered between export and import sections.
    var sepLine = rowMainBtns.add("panel", undefined, "");
    sepLine.alignment = ["fill", "center"];
    sepLine.preferredSize = [-1, 2];
    sepLine.margins = [0, 0, 0, 0];

    var spacerAfterSep = rowMainBtns.add("group");
    spacerAfterSep.preferredSize = [-1, 5];

    // Update test marker: helps confirm the updater pulled the new build.
    var importLabel = rowMainBtns.add("statictext", undefined, "Crowdin \u2192 After Effects");
    importLabel.alignment = ["center", "top"];
    importLabel.graphics = importLabel.graphics || {};
    try { importLabel.graphics.font = ScriptUI.newFont(importLabel.graphics.font.name, ScriptUI.FontStyle.PLAIN, 11); } catch(e2) {}

    var btnImportSelected = createFlatButton(rowMainBtns, "Import Selected", "Create new compositions from Crowdin translations for the selected composition(s) and language(s). New comps are named [comp name]_[language].", btnHeight);

    var spacerAfterImport = rowMainBtns.add("group");
    spacerAfterImport.preferredSize = [-1, 12];

    // Languages section in its own panel. Fills remaining vertical space; fixed width when panel.
    var panelLang = tabComposition.add("panel", undefined, "Languages");
    panelLang.orientation = "column";
    panelLang.alignChildren = ["fill", "top"];
    panelLang.alignment = ["fill", "fill"];
    panelLang.preferredSize = CONTENT_W > 0 ? [CONTENT_W, -1] : [-1, -1];
    panelLang.margins = [8, 8, 8, 10];
    panelLang.spacing = 6;

    var langHeader = panelLang.add("group");
    langHeader.orientation = "row";
    langHeader.alignChildren = ["left", "center"];
    langHeader.margins = [8, 0, 0, 0];

    var langHeaderSpacer = langHeader.add("group");
    langHeaderSpacer.alignment = ["fill", "center"];
    var txtLangPage = langHeader.add("statictext", undefined, "", {multiline:false});
    txtLangPage.alignment = ["right", "center"];
    var btnLangPrev = createFlatButton(langHeader, "Back", null, 18);
    btnLangPrev.preferredSize = [36, 18];
    var btnLangNext = createFlatButton(langHeader, "Next", null, 18);
    btnLangNext.preferredSize = [36, 18];

    // "All languages" in its own row so each column below has max 4 languages.
    var rowLangAll = panelLang.add("group");
    rowLangAll.orientation = "row";
    rowLangAll.alignChildren = ["left", "center"];
    rowLangAll.margins = [8, 4, 0, 4];
    cbLangAll = rowLangAll.add("checkbox", undefined, "All languages");
    cbLangAll.value = true;
    cbLangAll.helpTip = "When checked, all languages are used for export and import.";

    // Languages list: paged list of checkboxes. One column; use Next/Back pager for more.
    var langColumnsRow = panelLang.add("group");
    langColumnsRow.orientation = "row";
    langColumnsRow.alignChildren = ["fill", "top"];
    langColumnsRow.margins = [8, 0, 0, 0];

    var langColLeft = langColumnsRow.add("group");
    langColLeft.orientation = "column";
    langColLeft.alignChildren = ["left", "top"];
    langColLeft.margins = [4, 0, 0, 0];
    langColLeft.alignment = ["fill", "top"];

    // Language checkboxes: 4 per page, one column.
    var LANGS_PER_PAGE = 4;
    var langPageIndex = 0; // 0-based
    if (!STATE.languageSelections) STATE.languageSelections = {};

    // For per-language checkboxes we add them directly into langColLeft so they have
    // the same focus ring behavior as "All languages".
    var langCheckGroup = langColLeft;   // left column list host

    // Push footer row to bottom of Composition tab.
    var spacerBeforeCompFooter = tabComposition.add("group");
    spacerBeforeCompFooter.alignment = ["fill", "fill"];
    spacerBeforeCompFooter.minimumSize = [0, 0];

    // Composition footer: TMS action left; update link right (Readme is on Settings tab only).
    var compositionFooter = tabComposition.add("group");
    compositionFooter.orientation = "row";
    compositionFooter.alignChildren = ["left", "center"];
    compositionFooter.alignment = ["fill", "bottom"];
    compositionFooter.margins = [0, 0, 0, 0];
    compositionFooter.spacing = 6;

    var footerLeftSlot = compositionFooter.add("group");
    footerLeftSlot.orientation = "row";
    footerLeftSlot.alignChildren = ["left", "center"];
    footerLeftSlot.alignment = ["left", "center"];
    footerLeftSlot.margins = [4, 0, 0, 0];
    footerLeftSlot.spacing = 8;

    var btnFooterTmsAction = createFlatButton(footerLeftSlot, "AI Translation", "Pre-translate with Phrase Language AI, then duplicate selected compositions with translated text.", 24);
    btnFooterTmsAction.alignment = ["left", "center"];
    btnFooterTmsAction.minimumSize = [120, 24];
    btnFooterTmsAction.preferredSize = [120, 24];

    var compFooterSpacer = compositionFooter.add("group");
    compFooterSpacer.alignment = ["fill", "center"];
    try { compFooterSpacer.enabled = false; } catch (eSpDis) {}

    var lblNewVersion = compositionFooter.add("statictext", undefined, "New version available");
    lblNewVersion.alignment = ["right", "center"];
    lblNewVersion.helpTip = "A newer Cult Connector release is on GitHub. Click to download and install.";
    lblNewVersion.visible = false;
    stylePanelLinkText(lblNewVersion);
    $.global.CultConnectorAE_lblNewVersion = lblNewVersion;

    function syncFooterTmsActionButton() {
      try {
        var show = false;
        var label = "AI Translation";
        var tip = "Uploads strings from the main comp and nested precomps (no screenshots), runs Phrase Language AI, then duplicates comps with translated text.";
        if (TMS_PROVIDER === "phrase") {
          show = true;
          label = "AI Translation";
        } else if (TMS_PROVIDER === "crowdin_team" || TMS_PROVIDER === "crowdin_enterprise") {
          show = true;
          label = "Pseudo Translation";
          tip = "Uploads strings (no screenshots), builds Crowdin pseudo-localization (accent-style test characters), then duplicates comps. For real translations, use Import Selected after translating in Crowdin.";
        }
        btnFooterTmsAction.text = label;
        btnFooterTmsAction.helpTip = tip;
        btnFooterTmsAction.visible = show;
        try { footerLeftSlot.layout.layout(true); } catch (eFl) {}
        try { compositionFooter.layout.layout(true); } catch (eCf) {}
      } catch (eSync) {}
    }
    syncFooterTmsActionButton();

    lblNewVersion.addEventListener("click", function () {
      if (!$.global.CultConnectorAE_pendingUpdateInfo) {
        refreshNewVersionLinkUi(lblNewVersion, setStatus);
      }
      promptInstallPendingUpdate(setStatus);
    });

    tabSettings.orientation = "column";
    tabSettings.alignChildren = ["fill", "top"];
    tabSettings.margins = [8, 10, 8, 8];
    tabSettings.spacing = 6;

    var panelProj = tabSettings.add("panel", undefined, "Crowdin Project");
    panelProj.orientation = "column";
    panelProj.alignChildren = ["fill", "top"];
    panelProj.margins = 8;
    panelProj.spacing = 8;

    var rowProj = panelProj.add("group");
    rowProj.orientation = "row";
    rowProj.alignChildren = ["fill", "center"];
    rowProj.spacing = 8;
    rowProj.margins = [0, 8, 0, 0];

    var ddProj = rowProj.add("dropdownlist", undefined, []);
    ddProj.preferredSize = [-1, 24];
    ddProj.minimumSize = [180, 24];
    ddProj.alignment = ["fill", "center"];
    ddProj.helpTip = "Current Crowdin project. Change to load a different project's languages.";

    var rowProjButtons = panelProj.add("group");
    rowProjButtons.orientation = "row";
    rowProjButtons.alignChildren = ["left", "center"];
    rowProjButtons.spacing = 6;
    rowProjButtons.margins = [0, 4, 0, 0];

    // Open in Crowdin (left, blue link-style text); Refresh and Disconnect (right).
    var btnOpenCrowdin = rowProjButtons.add("statictext", undefined, "Open in Crowdin");
    btnOpenCrowdin.alignment = ["left", "center"];
    btnOpenCrowdin.helpTip = "Open this Crowdin project in the browser.";
    try {
      var crowdinBlue = btnOpenCrowdin.graphics.newPen(btnOpenCrowdin.graphics.PenType.SOLID_COLOR, [0.2, 0.55, 1, 1], 1);
      btnOpenCrowdin.graphics.foregroundColor = crowdinBlue;
    } catch (eOC) {}

    var spacerCrowdin = rowProjButtons.add("group");
    spacerCrowdin.alignment = ["fill", "center"];
    spacerCrowdin.preferredSize = [-1, 18];

    var btnRefreshProj = createFlatButton(rowProjButtons, "Refresh", "Reload projects and languages from Crowdin.", 18);
    btnRefreshProj.preferredSize = [60, 18];

    var btnDisconnect = createFlatButton(rowProjButtons, "Disconnect", null, 18);
    btnDisconnect.preferredSize=[70,18];

    function updateTmsUiLabels() {
      var brand = tmsBrandName();
      try { exportLabel.text = "After Effects \u2192 " + brand; } catch (e1) {}
      try { importLabel.text = brand + " \u2192 After Effects"; } catch (e2) {}
      try { panelProj.text = brand + " Project"; } catch (e3) {}
      try { btnOpenCrowdin.text = "Open in " + brand; } catch (e4) {}
      try {
        btnSendCompositions.helpTip = "Export selected compositions to " + brand + " for the chosen target language(s).";
        btnImportSelected.helpTip = "Create new compositions from " + brand + " translations for the selected composition(s) and language(s). New comps are named [comp name]_[language].";
        btnRefreshProj.helpTip = "Reload projects and languages from " + brand + ".";
        ddProj.helpTip = "Current " + brand + " project. Change to load a different project's languages.";
      } catch (e5) {}
      try { syncFooterTmsActionButton(); } catch (e6) {}
      try {
        if (cbSegmentation) {
          cbSegmentation.visible = (
            TMS_PROVIDER === "crowdin_team" ||
            TMS_PROVIDER === "crowdin_enterprise" ||
            TMS_PROVIDER === "phrase"
          );
          if (TMS_PROVIDER === "phrase") {
            cbSegmentation.helpTip = "When enabled, Phrase may split long lines into multiple segments (WebXML segmentation). Each AE text layer still gets its own timeline screenshot.";
          } else {
            cbSegmentation.helpTip = "When enabled, long lines may be split into multiple segments in Crowdin (WebXML/SRX).";
          }
        }
      } catch (e7) {}
    }

    function getSelectedLanguagesFromPanel() {
      var selected = [];
      if (cbLangAll && cbLangAll.value === true && STATE.languages && STATE.languages.length) {
        for (var k = 0; k < STATE.languages.length; k++) {
          var lang = STATE.languages[k];
          selected.push({
            id: lang.id,
            name: (lang.name != null && String(lang.name).length > 0) ? String(lang.name).replace(/^\s+|\s+$/g, "") : lang.id
          });
        }
      } else if (STATE.languages && STATE.languages.length && STATE.languageSelections) {
        var L = STATE.languages;
        for (var i = 0; i < L.length; i++) {
          var id = L[i].id;
          if (STATE.languageSelections[id] === true) {
            var name = (L[i].name != null && String(L[i].name).length > 0) ? String(L[i].name).replace(/^\s+|\s+$/g, "") : id;
            selected.push({ id: id, name: name });
          }
        }
      }
      return selected;
    }

    function importSelectedCompositionsWithProgress(statusProxy, popupSetProgress, progressOpts) {
      progressOpts = progressOpts || {};
      var progressOffset = Number(progressOpts.progressOffset) || 0;
      var progressTotal = Number(progressOpts.progressTotal) || 0;
      var statusPrefix = progressOpts.statusPrefix || "Importing";
      var pseudoItemsByFileKey = progressOpts.pseudoItemsByFileKey || null;
      var comps = progressOpts.comps || getSelectedComps();
      var selected = progressOpts.selected || getSelectedLanguagesFromPanel();
      if (!comps || comps.length === 0) return { ok: false, reason: "no_comps" };
      if (!selected.length) return { ok: false, reason: "no_langs" };
      var totalWork = comps.length * selected.length;
      var total = progressTotal > 0 ? progressTotal : totalWork;
      var done = 0;
      for (var c = 0; c < comps.length; c++) {
        var comp = comps[c];
        var compName = (comp.name != null) ? String(comp.name) : ("comp " + (c + 1));
        for (var d = 0; d < selected.length; d++) {
          var displayName = selected[d].name || selected[d].id;
          statusProxy(statusPrefix + " " + compName + " \u2192 " + displayName + " (" + String(selected[d].id).toUpperCase() + ")…");
          if (popupSetProgress) popupSetProgress(progressOffset + done, total);
          var fkImp = safeFileKeyForComp(comp);
          var preItems = lookupPseudoFileItems(pseudoItemsByFileKey, fkImp);
          importText(comp, selected[d].id, statusProxy, displayName, preItems);
          done++;
          if (popupSetProgress) popupSetProgress(progressOffset + done, total);
        }
      }
      return { ok: true, done: done };
    }

    var rowSegmentation = panelProj.add("group");
    rowSegmentation.orientation="row";
    rowSegmentation.alignChildren=["left","center"];
    rowSegmentation.spacing=6;
    rowSegmentation.margins = [4, 0, 0, 0];
    cbSegmentation = rowSegmentation.add("checkbox", undefined, "Content Segmentation");
    cbSegmentation.alignment = ["left", "center"];
    cbSegmentation.helpTip = "When enabled, long lines may be split into multiple segments in the TMS (Crowdin SRX / Phrase segmentation).";
    cbSegmentation.value = true;
    STATE.useSegmentation = true;
    cbSegmentation.onClick = function () {
      STATE.useSegmentation = (cbSegmentation.value === true);
    };

    // ----- Settings footer: Readme on the right (blue link-style text) -----
    var settingsFooter = tabSettings.add("group");
    settingsFooter.orientation = "row";
    settingsFooter.alignChildren = ["left", "center"];
    settingsFooter.margins = [0, 4, 0, 0];
    settingsFooter.spacing = 6;

    var footerSpacer = settingsFooter.add("group");
    footerSpacer.alignment = ["fill", "center"];
    var btnReadme = settingsFooter.add("statictext", undefined, "Readme");
    btnReadme.alignment = ["right", "center"];
    btnReadme.helpTip = "Open plugin readme and data security info.";

    try {
      var linkBlue = btnReadme.graphics.newPen(btnReadme.graphics.PenType.SOLID_COLOR, [0.2, 0.55, 1, 1], 1);
      btnReadme.graphics.foregroundColor = linkBlue;
    } catch (eLink) {}

    function showReadmeDialog(){
      try {
        var dlg = new Window("dialog", "Cult Connector (AE ↔ TMS)");
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.margins = [12, 12, 12, 8];
        dlg.spacing = 6;

        var msg = dlg.add("statictext", undefined,
          "Cult Connector (AE ↔ TMS)\n" +
          "Version " + PLUGIN_VERSION + "\n\n" +
          "Connects After Effects to your TMS (Crowdin or Phrase TMS) via Cult Extensions.\n\n" +
          "Data security:\n\n" +
          "• Text and screenshots are sent over HTTPS to login.cultextensions.com, then to your TMS.\n" +
          "• Screenshots are staged on the server only until publish, then removed.\n" +
          "• OAuth tokens and device binding are stored on the server, not in this panel.\n" +
          "• Each seat is bound to one computer (device binding).\n" +
          "• Paid TMS connect uses your Cult Studio seat; multiple workspaces are resolved automatically (optional override on Settings).\n" +
          "• Translations live in your TMS project; Cult Connector does not store them.\n\n" +
          "Cult Connector is property of Cult Extensions.\n" +
          "© 2026 Cult Extensions. All rights reserved.\n\n" +
          "Support: contact@cultextensions.com",
          { multiline: true }
        );
        msg.alignment = ["fill", "top"];
        msg.preferredSize = [360, -1];

        var rowBtns = dlg.add("group");
        rowBtns.orientation = "row";
        rowBtns.alignChildren = ["right", "center"];
        var ok = createFlatButton(rowBtns, "OK", null, 22);
        ok.alignment = ["right", "center"];

        dlg.minimumSize = [380, 200];
        dlg.layout.layout(true);
        dlg.center();
        dlg.show();
      } catch (e) {
        alertIf("Readme\n\nCult Connector (AE ↔ TMS)\nVersion " + PLUGIN_VERSION + "\n\nData security:\n" +
                "- HTTPS to Cult Extensions, then your TMS (Crowdin or Phrase).\n" +
                "- OAuth and license binding on first login (no license file in the panel).\n" +
                "- Translations stay in your TMS project.\n\n" +
                "Cult Connector is property of Cult Extensions.\n" +
                "© 2026 Cult Extensions. All rights reserved.\n\n" +
                "Support: contact@cultextensions.com");
      }
    }

    // Simple centered popup progress bar for AE → TMS export operations.
    function showAeCrowdinProgressPopup() {
      try {
        var brand = tmsBrandName();
        var w = new Window("palette", "After Effects \u2192 " + brand);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.margins = 12;
        var title = w.add("statictext", undefined, "After Effects \u2192 " + brand, { multiline: false });
        title.alignment = ["center", "top"];
        var statusLabel = w.add("statictext", undefined, "Preparing…", { multiline: false });
        statusLabel.preferredSize = [380, 22];
        statusLabel.alignment = ["fill", "top"];
        var bar = w.add("progressbar", undefined, 0, 100);
        bar.preferredSize = [380, 12];
        bar.value = 0;
        try { app.refresh(); } catch (eR0) {}
        w.layout.layout(true);
        w.center();
        w.show();
        return { win: w, bar: bar, statusLabel: statusLabel };
      } catch (e) {
        return null;
      }
    }

    function updateProgressPopup(popup, value, statusText) {
      if (!popup) return;
      if (popup.bar) {
        var v = Math.round(value);
        if (v < 0) v = 0;
        if (v > 100) v = 100;
        popup.bar.value = v;
      }
      if (statusText && popup.statusLabel) popup.statusLabel.text = statusText;
      try {
        if (popup.win && popup.win.update) popup.win.update();
        else if (popup.win && popup.win.layout) popup.win.layout.layout(true);
      } catch (eUp) {}
      try { app.refresh(); } catch (eRf) {}
    }

    /** Short animated bump so the bar moves before/after blocking network calls. */
    function pulseProgressPopup(popup, fromPct, toPct, statusText, pulses) {
      if (!popup || !popup.bar) return;
      pulses = (pulses != null && pulses > 0) ? pulses : 8;
      var fromV = Number(fromPct) || 0;
      var toV = Number(toPct) || fromV;
      for (var p = 0; p <= pulses; p++) {
        var frac = pulses > 0 ? (p / pulses) : 1;
        updateProgressPopup(popup, fromV + (toV - fromV) * frac, statusText);
        try { $.sleep(35); } catch (eSl) {}
      }
    }

    /** Let the progress palette repaint before a long blocking step (scheduleTask is unreliable in AE panels). */
    function pumpProgressUi(popup, pct, msg) {
      updateProgressPopup(popup, pct, msg);
      try {
        if (popup && popup.win) {
          if (popup.win.update) popup.win.update();
          else if (popup.win.layout) popup.win.layout.layout(true);
        }
      } catch (ePu) {}
      try { app.refresh(); } catch (eRf) {}
      try { $.sleep(100); } catch (eSl) {}
    }

    // Centered popup progress bar for TMS → AE imports.
    function showCrowdinAeProgressPopup(titleSuffix) {
      try {
        var brand = tmsBrandName();
        var winTitle = titleSuffix ? String(titleSuffix) : (brand + " \u2192 After Effects");
        var w = new Window("palette", winTitle);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.margins = 12;
        var titleLabel = w.add("statictext", undefined, winTitle, { multiline: false });
        titleLabel.alignment = ["center", "top"];
        var statusLabel = w.add("statictext", undefined, "Preparing…", { multiline: false });
        statusLabel.preferredSize = [380, 22];
        statusLabel.alignment = ["fill", "top"];
        var bar = w.add("progressbar", undefined, 0, 100);
        bar.preferredSize = [380, 12];
        bar.value = 0;
        try { app.refresh(); } catch (eR1) {}
        w.layout.layout(true);
        w.center();
        w.show();
        return { win: w, bar: bar, statusLabel: statusLabel };
      } catch (e) {
        return null;
      }
    }

    function updateLangPager(){
      var L = STATE.languages || [];
      var total = L.length;
      if (total <= 0) {
        txtLangPage.text = "No languages.";
        btnLangPrev.enabled = false;
        btnLangNext.enabled = false;
        btnLangPrev.visible = true;
        txtLangPage.visible = true;
        btnLangNext.visible = true;
        return;
      }
      var totalPages = Math.max(1, Math.ceil(total / LANGS_PER_PAGE));
      if (langPageIndex < 0) langPageIndex = 0;
      if (langPageIndex > totalPages - 1) langPageIndex = totalPages - 1;
      var start = langPageIndex * LANGS_PER_PAGE;
      var end = Math.min(total, start + LANGS_PER_PAGE);
      txtLangPage.text = (start + 1) + "–" + end + " of " + total;
      btnLangPrev.enabled = (langPageIndex > 0);
      btnLangNext.enabled = (langPageIndex < totalPages - 1);
      var showPager = (totalPages > 1);
      btnLangPrev.visible = showPager;
      txtLangPage.visible = showPager;
      btnLangNext.visible = showPager;
    }

    function fillProjects(ps){
      ddProj.removeAll();
      for (var i = 0; i < ps.length; i++) {
        var it = ddProj.add("item", ps[i].name);
        it._project = ps[i];
      }
      if (ddProj.items.length) {
        var targetIdx = 0;
        if (STATE.projectId && ps && ps.length) {
          for (var i = 0; i < ps.length; i++) {
            if (String(ps[i].id) === String(STATE.projectId)) { targetIdx = i; break; }
          }
        }
        ddProj.selection = targetIdx;
      }
      pal.layout.layout(true);
    }

    function fillLangs(langs){
      // Always prefer freshly loaded languages when provided; otherwise fall back to existing STATE.languages.
      if (langs && langs.length) {
        STATE.languages = langs;
        // Reset page and clear previous selections when a new project loads.
        langPageIndex = 0;
        STATE.languageSelections = {};
      } else if (!STATE.languages) {
        STATE.languages = [];
      }
      if (typeof langCheckGroup !== "undefined") {
        // Clear existing language checkboxes (All languages is in rowLangAll).
        while (langCheckGroup.children.length > 0) langCheckGroup.remove(langCheckGroup.children[0]);
        var L = STATE.languages || [];
        if (!L.length) {
          var emptyMsg = langCheckGroup.add("statictext", undefined, "No languages loaded. Refresh the project.", {multiline:false});
          emptyMsg.enabled = false;
          pal.layout.layout(true);
          updateLangPager();
          return;
        }
        var total = L.length;
        var totalPages = Math.max(1, Math.ceil(total / LANGS_PER_PAGE));
        if (langPageIndex < 0) langPageIndex = 0;
        if (langPageIndex > totalPages - 1) langPageIndex = totalPages - 1;
        var start = langPageIndex * LANGS_PER_PAGE;
        var end = Math.min(total, start + LANGS_PER_PAGE);
        var defaultChecked = cbLangAll && cbLangAll.value === true;

        // Single-column page: LANGS_PER_PAGE items per page, scroll with Back/Next.
        for (var j = start; j < end; j++) {
          var lang = L[j];
          var baseLabel = (lang.name || lang.id) + " (" + String(lang.id || "").toUpperCase() + ")";
          var cb = langCheckGroup.add("checkbox", undefined, baseLabel);
          cb._langId = lang.id;
          cb._langName = (lang.name != null && String(lang.name).length > 0) ? String(lang.name).replace(/^\s+|\s+$/g, "") : (lang.id || "");
          // Use stored selection if available; otherwise inherit from All checkbox.
          var stored = (STATE.languageSelections && STATE.languageSelections.hasOwnProperty(lang.id)) ? STATE.languageSelections[lang.id] : null;
          cb.value = (stored !== null) ? stored : defaultChecked;
          cb.onClick = function(){
            if (!this._langId) return;
            if (!STATE.languageSelections) STATE.languageSelections = {};
            STATE.languageSelections[this._langId] = (this.value === true);
            if (!cbLangAll) return;
            var allOn = true;
            var list = STATE.languages || [];
            if (!list.length) allOn = false;
            for (var i = 0; i < list.length; i++) {
              var lid = list[i].id;
              var val;
              if (STATE.languageSelections && STATE.languageSelections.hasOwnProperty(lid)) {
                val = STATE.languageSelections[lid];
              } else {
                val = defaultChecked;
              }
              if (!val) { allOn = false; break; }
            }
            cbLangAll.value = allOn;
          };
        }
        pal.layout.layout(true);
        updateLangPager();
      }
      pal.layout.layout(true);
    }

    // Keep \"All languages\" checkbox in sync with all language selections when toggled directly.
    cbLangAll.onClick = function() {
      var L = STATE.languages || [];
      if (!STATE.languageSelections) STATE.languageSelections = {};
      var v = cbLangAll.value === true;
      for (var i = 0; i < L.length; i++) {
        STATE.languageSelections[L[i].id] = v;
      }
      fillLangs(null); // re-render current page with updated checkboxes
    };

    btnReadme.addEventListener("click", function () { showReadmeDialog(); });

    btnDisconnect.onClick = function(){
      cancelOauthPoll();
      try { curlPostJson(EP_DISCONNECT, "{}"); } catch (eDisconnect) {}
      STATE.projectId = null;
      STATE.projectName = null;
      STATE.projects = null;
      STATE.languages = null;
      STATE.connected = false;
      onboardingGroup.visible = true;
      mainGroup.visible = false;
      showOnboardingStep0();
      contentStack.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 220] : [-1, 220];
      onboardingGroup.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 220] : [-1, 220];
      if (typeof progressLabel !== "undefined") progressLabel.text = "Disconnected. Select a TMS to connect.";
      pal.layout.layout(true);
      if (pal.layout.resize) pal.layout.resize();
      if (pal instanceof Window) pal.size = [560, 280];
    };

    btnOpenCrowdin.addEventListener("click", function () {
      if (!STATE.projectId) { alertIf("No project selected."); return; }
      if (TMS_PROVIDER === "phrase") {
        openUrl("https://cloud.memsource.com/web/project2/show/" + encodeURIComponent(String(STATE.projectId)));
        return;
      }
      if (EP_PROJECT_BROWSER_LINK) {
        var br = curlGet(EP_PROJECT_BROWSER_LINK + "?projectId=" + encodeURIComponent(String(STATE.projectId)));
        if (br.http === "200") {
          var directLink = extractJsonField(br.body, "directUrl");
          var browserLink = extractJsonField(br.body, "url");
          var orgFromBr = extractJsonField(br.body, "organization");
          if (orgFromBr) STATE.crowdinOrganization = orgFromBr;
          if (directLink) { openUrl(directLink); return; }
          if (browserLink && browserLink.indexOf(".crowdin.com") >= 0) { openUrl(browserLink); return; }
        }
      }
      var p = null;
      var i;
      if (STATE.projects && STATE.projects.length) {
        for (i = 0; i < STATE.projects.length; i++) {
          if (String(STATE.projects[i].id) === String(STATE.projectId)) { p = STATE.projects[i]; break; }
        }
      }
      var url = "";
      if (p && p.webUrl) url = String(p.webUrl);
      if (!url && STATE.crowdinOrganization) {
        url = "https://" + STATE.crowdinOrganization + ".crowdin.com/u/projects/" + encodeURIComponent(String(STATE.projectId));
      }
      if (!url && p && p.identifier) {
        url = "https://crowdin.com/project/" + encodeURIComponent(String(p.identifier));
      }
      if (!url) {
        alertIf("Could not build Crowdin project URL. Click Refresh, then try again.");
        return;
      }
      openUrl(url);
    });

    ddProj.onChange = function(){
      var sel = ddProj.selection;
      var p = (sel && sel._project) ? sel._project : null;
      if (!p) return;
      selectProject(p.id, p.name, setStatus);
      fillLangs(loadLanguages(setStatus));
    };

    btnRefreshProj.onClick = function(){
      if (!STATE.connected) { alertIf("Connect first."); return; }
      setStatus("Reloading projects…");
      STATE.projects = loadProjects(setStatus);
      if (STATE.projects && STATE.projects.length) fillProjects(STATE.projects);
      if (STATE.projectId) {
        setStatus("Reloading languages…");
        fillLangs(loadLanguages(setStatus));
      }
      setStatus("Projects and languages refreshed.");
    };

    btnLangPrev.onClick = function() {
      if (!STATE.languages || !STATE.languages.length) return;
      if (langPageIndex <= 0) return;
      langPageIndex--;
      fillLangs(null);
    };

    btnLangNext.onClick = function() {
      var L = STATE.languages || [];
      if (!L.length) return;
      var totalPages = Math.max(1, Math.ceil(L.length / LANGS_PER_PAGE));
      if (langPageIndex >= totalPages - 1) return;
      langPageIndex++;
      fillLangs(null);
    };

    btnSendCompositions.onClick = function(){
      if (!STATE.connected) { alertIf("Connect first."); return; }
      if (!STATE.projectId) { alertIf("Select a project first."); return; }
      var uploadTargets = [];
      if (cbLangAll && cbLangAll.value === true) {
        uploadTargets.push("all");
      } else {
        var L = STATE.languages || [];
        if (L.length && STATE.languageSelections) {
          for (var i = 0; i < L.length; i++) {
            var id = L[i].id;
            if (STATE.languageSelections[id] === true) uploadTargets.push(id);
          }
        }
      }
      if (!uploadTargets.length) {
        alertIf("Select at least one language.");
        return;
      }
      STATE.compsToSend = [];
      var popup = IS_WIN ? { win: null, statusLabel: null, bar: null } : showAeCrowdinProgressPopup();
      function popupStatus(msg) {
        if (popup && popup.statusLabel) popup.statusLabel.text = msg || "";
      }
      function popupSetProgress(current, total, message) {
        if (!popup || !popup.bar) return;
        var max = (total && total > 0) ? total : 1;
        var frac = current / max;
        if (frac < 0) frac = 0;
        if (frac > 1) frac = 1;
        var base = 60;
        var end = 100;
        popup.bar.value = Math.round(base + (end - base) * frac);
        try { app.refresh(); } catch (eR2) {}
      }
      function statusProxy(msg) {
        popupStatus(msg);
        setStatus(msg);
      }
      try {
      popupStatus("Preparing…");
      var comps = getSelectedComps();
      if (!comps || comps.length === 0) {
        alertIf("Select one or more compositions in the Project panel, or open a composition in the timeline.");
        if (popup && popup.win) try { popup.win.close(); } catch(eC0) {}
        pal.layout.layout(true);
        STATE.compsToSend = [];
        return;
      }
      STATE.useSegmentation = (typeof cbSegmentation !== "undefined" && cbSegmentation.value === true);
      var allOk = true;

      if (IS_WIN) {
        // Windows: single blocking run() — collect strings + scan manifest, then one batch (strings curls + scan curls).
        var stringsUploads = [];
        for (var t = 0; t < uploadTargets.length; t++) {
          var currentTarget = uploadTargets[t];
          for (var c = 0; c < comps.length; c++) {
            var comp = comps[c];
            STATE.fileKey = safeFileKeyForComp(comp);
            STATE.compId = String(comp.id);
            var items = collectText(statusProxy, comp);
            if (!items || !items.length) continue;
            var itemsToSend = [];
            for (var i = 0; i < items.length; i++) itemsToSend.push({ id: items[i].id, text: items[i].text });
            var payload = jsonStringifyMini({ fileKey: STATE.fileKey, items: itemsToSend });
            var fStrings = new File(tempPath("ct_win_s_" + t + "_" + c + ".json"));
            if (!writeTextFile(fStrings, payload)) { allOk = false; break; }
            var fields = [
              { name: "projectId", value: STATE.projectId },
              { name: "compId", value: STATE.compId },
              { name: "fileKey", value: STATE.fileKey },
              { name: "useSegmentation", value: STATE.useSegmentation ? "1" : "0" }
            ];
            if (currentTarget && currentTarget !== "all") fields.push({ name: "targetLanguage", value: currentTarget });
            stringsUploads.push({ path: fStrings.fsName, fields: fields });
          }
          if (!allOk) break;
        }
        if (!allOk || stringsUploads.length === 0) {
          if (popup && popup.win) try { popup.win.close(); } catch(e) {}
          pal.layout.layout(true);
          STATE.compsToSend = [];
          return;
        }
        popupStatus("Scanning timeline…");
        var scanManifest = [];
        for (var sc = 0; sc < comps.length; sc++) {
          try { app.project.activeItem = comps[sc]; } catch (eAct) {}
          STATE.fileKey = safeFileKeyForComp(comps[sc]);
          if (comps.length > 1) popupStatus("Scanning: " + (comps[sc].name || STATE.fileKey) + "…");
          smartScanTimeline(function(){}, function(){}, comps[sc], scanManifest);
        }
        popupStatus("Uploading…");
        var winResPath = tempPath("ct_win_s0_res.txt");
        var winHeadPath = tempPath("ct_win_s0_head.txt");
        var i, su, cmd, mi, item, one, scanCmd;
        try {
          var dbg = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt");
          dbg.encoding = "UTF-8";
          dbg.open("a");
          dbg.write("\r\n[WIN send] scanManifest.length=" + scanManifest.length + " stringsUploads=" + stringsUploads.length + "\r\n");
          if (scanManifest.length > 0) dbg.write("[WIN send] first scan pngPath=" + (scanManifest[0].pngPath || "") + "\r\n");
          dbg.close();
        } catch (_) {}
        try {
          for (i = 0; i < stringsUploads.length; i++) {
            su = stringsUploads[i];
            cmd = buildStringsCurlCmd(su.path, su.fields);
            cmd += ' -o "' + pathForCurl(i === 0 ? winResPath : "nul") + '" "' + EP_STRINGS + '" -D "' + pathForCurl(i === 0 ? winHeadPath : "nul") + '"';
            run(cmd);
          }
          for (mi = 0; mi < scanManifest.length; mi++) {
            item = scanManifest[mi];
            var fkJsonFileWin = new File(tempPath("ct_fk_scan_" + safeScreenshotBase(item.fileKey || STATE.fileKey) + ".json"));
            try {
              if (!fkJsonFileWin.exists) {
                writeTextFile(fkJsonFileWin, jsonStringifyMini({ fileKey: item.fileKey || STATE.fileKey }));
              }
            } catch (eFkW) {}
            one = curlPostMultipartBuild(EP_SCAN_FRAME,
              scanFrameUploadFields(item.projectId, item.fileKey, item.t, item.ssName, item.ssWidth, item.ssHeight, item.cultStringId, mi),
              [
                { name: "png", path: item.pngPath, mime: "image/png" },
                { name: "boxes", path: item.boxesPath, mime: "application/json" },
                { name: "fileKeyJson", path: fkJsonFileWin.fsName, mime: "application/json" }
              ],
              "win_batch_" + mi);
            scanCmd = one.cmd.replace(/-o\s+"[^"]*"/, '-o nul').replace(/-D\s+"[^"]*"/, '-D nul');
            scanCmd = scanCmd.replace(/\s--http2\s/, ' --http1.1 ');
            run(scanCmd);
          }
        } catch (eRun) {
          setStatus("Upload failed (run error).");
          alertIf("Upload failed: " + (eRun && eRun.message ? eRun.message : String(eRun)));
          if (popup && popup.win) try { popup.win.close(); } catch(e) {}
          STATE.compsToSend = [];
          return;
        }
        for (mi = 0; mi < scanManifest.length; mi++) {
          var errF = new File(tempPath("ct_mp_win_batch_" + mi + ".err.txt"));
          if (errF.exists && errF.length > 0) {
            try {
              var errContent = readTextFile(errF);
              var dbgErr = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt");
              dbgErr.encoding = "UTF-8";
              dbgErr.open("a");
              dbgErr.write("\r\n[WIN scan curl " + mi + " stderr] " + (errContent || "").replace(/\r?\n/g, " ") + "\r\n");
              dbgErr.close();
            } catch (_) {}
          }
        }
        var resFile = new File(winResPath);
        var headFile = new File(winHeadPath);
        var http = readHttpCodeFromCurlResult(null, headFile);
        var body = resFile.exists ? readTextFile(resFile) : "";
        if (http !== "200") {
          setStatus("Upload failed.");
          alertIf("Upload strings failed.\nHTTP " + http + "\n\n" + body);
          if (popup && popup.win) try { popup.win.close(); } catch(e) {}
          STATE.compsToSend = [];
          return;
        }
        if (TMS_PROVIDER === "phrase") {
          var pubSeenWin2 = {};
          for (var pubW2 = 0; pubW2 < stringsUploads.length; pubW2++) {
            var suFld2 = stringsUploads[pubW2].fields || [];
            var fkPubW2 = "";
            for (var pubF2 = 0; pubF2 < suFld2.length; pubF2++) {
              if (suFld2[pubF2].name === "fileKey") { fkPubW2 = String(suFld2[pubF2].value || ""); break; }
            }
            if (fkPubW2 && !pubSeenWin2[fkPubW2]) {
              pubSeenWin2[fkPubW2] = true;
              phraseAePublishExport(fkPubW2);
            }
          }
        }
        var statusMsg = "Uploaded!";
        try {
          var r = JSON.parse(body || "{}");
          if (r.fileName) statusMsg = "Uploaded as " + (r.displayFileName || r.fileName);
          if (r._receivedFilename != null) statusMsg += " (received: " + String(r._receivedFilename) + ")";
        } catch(e) {}
        setStatus(statusMsg);
        STATE.compsToSend = [];
        if (popup && popup.win) try { popup.win.close(); } catch(e) {}
        return;
      }

      for (var t = 0; t < uploadTargets.length; t++) {
        var currentTarget = uploadTargets[t];
        if (popup && popup.bar) {
          var fracUpload = uploadTargets.length ? (t / uploadTargets.length) : 0;
          var startU = 20;
          var endU = 60;
          if (fracUpload < 0) fracUpload = 0;
          if (fracUpload > 1) fracUpload = 1;
          popup.bar.value = Math.round(startU + (endU - startU) * fracUpload);
          try { app.refresh(); } catch (eR3) {}
        }
        popupStatus("Uploading: " + (currentTarget === "all" ? "All Languages" : String(currentTarget).toUpperCase()));
        for (var c = 0; c < comps.length; c++) {
          var comp = comps[c];
          var compName = (comp.name != null) ? String(comp.name) : ("comp " + (c + 1));
          if (comps.length > 1) popupStatus("Uploading: " + (currentTarget === "all" ? "All Languages" : String(currentTarget).toUpperCase()) + " — " + compName);
          var items = collectText(statusProxy, comp);
          if (!items || !items.length) continue;
          var ok = uploadStrings(items, statusProxy, currentTarget);
          if (IS_WIN) { try { var _s0 = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _s0.encoding = "UTF-8"; _s0.open("a"); _s0.write("[Send] after uploadStrings returned ok=" + ok + "\r\n"); _s0.close(); } catch (_x) {} }
          if (!ok) { allOk = false; break; }
        }
        if (!allOk) break;
      }
      if (!allOk) {
        if (popup && popup.win) try { popup.win.close(); } catch(eC2) {}
        pal.layout.layout(true);
        STATE.compsToSend = [];
        return;
      }
      if (IS_WIN) { try { var _s1 = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _s1.encoding = "UTF-8"; _s1.open("a"); _s1.write("[Send] about to statusProxy\r\n"); _s1.close(); } catch (_x) {} }
      // On Windows, system.callSystem (used by curl upload) is blocking; UI updates immediately after can crash AE.
      // AE/docs: add delay or error handling after blocking system calls. We sleep then attempt UI in try/catch.
      if (IS_WIN) {
        try { var _sw = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _sw.encoding = "UTF-8"; _sw.open("a"); _sw.write("[Send] Windows: before sleep(400)\r\n"); _sw.close(); } catch (_x) {}
        $.sleep(400);
        try { var _sw2 = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _sw2.encoding = "UTF-8"; _sw2.open("a"); _sw2.write("[Send] Windows: after sleep, before try\r\n"); _sw2.close(); } catch (_x) {}
        try {
          try { var _st = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _st.encoding = "UTF-8"; _st.open("a"); _st.write("[Send] Windows: inside try, skipping statusProxy to avoid ScriptUI crash\r\n"); _st.close(); } catch (_x) {}
          // Do NOT call statusProxy/popupStatus/setStatus here - it triggers "file not found" native crash on Windows after blocking curl.
          for (var w = 0; w < 6; w++) { if (w > 0) $.sleep(80); }
          try { var _st3 = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _st3.encoding = "UTF-8"; _st3.open("a"); _st3.write("[Send] Windows: after wait loop\r\n"); _st3.close(); } catch (_x) {}
          // Windows: run timeline scan (strings upload did not block in main thread, so this may avoid the crash).
          for (var sc = 0; sc < comps.length; sc++) {
            try { app.project.activeItem = comps[sc]; } catch (eAct) {}
            STATE.fileKey = safeFileKeyForComp(comps[sc]);
            smartScanTimeline(function(){}, function(){}, comps[sc]);
          }
          STATE.compsToSend = [];
          try { var _st4 = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _st4.encoding = "UTF-8"; _st4.open("a"); _st4.write("[Send] Windows: scan done\r\n"); _st4.close(); } catch (_x) {}
        } catch (eWinUI) {
          try { var _err = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _err.encoding = "UTF-8"; _err.open("a"); _err.write("[Send] Windows UI after delay threw: " + (eWinUI && eWinUI.message ? eWinUI.message : String(eWinUI)) + "\r\n"); _err.close(); } catch (_) {}
          for (var sc = 0; sc < comps.length; sc++) {
            try { app.project.activeItem = comps[sc]; } catch (eAct) {}
            STATE.fileKey = safeFileKeyForComp(comps[sc]);
            smartScanTimeline(function(){}, function(){}, comps[sc]);
          }
        }
      } else {
        statusProxy("Waiting for " + tmsBrandName() + "…");
        for (var w = 0; w < 6; w++) {
          if (w > 0) $.sleep(80);
          try { app.refresh(); } catch (eR) {}
        }
        popupStatus("Scanning timeline…");
        for (var sc = 0; sc < comps.length; sc++) {
          try { app.project.activeItem = comps[sc]; } catch (eAct) {}
          STATE.fileKey = safeFileKeyForComp(comps[sc]);
          if (comps.length > 1) popupStatus("Scanning timeline: " + (comps[sc].name || STATE.fileKey) + "…");
          smartScanTimeline(statusProxy, popupSetProgress, comps[sc]);
          if (TMS_PROVIDER === "phrase") phraseAePublishExport(STATE.fileKey);
        }
        if (popup && popup.bar) {
          popup.bar.value = 100;
          try { app.refresh(); } catch (eR4) {}
        }
        if (popup && popup.win) try { popup.win.close(); } catch(eC3) {}
      }
      if (IS_WIN) {
        // Avoid extra sleep and UI work after blocking curl; crash often happens when handler returns and AE repaints.
        try { var _fd = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _fd.encoding = "UTF-8"; _fd.open("a"); _fd.write("[Send] Windows: skipping layout/setStatus\r\n"); _fd.close(); } catch (_) {}
        try { var _fe = new File(Folder.myDocuments.fsName + "/Crowdin_send_debug.txt"); _fe.encoding = "UTF-8"; _fe.open("a"); _fe.write("[Send] Windows: handler exiting (no sleep/layout)\r\n"); _fe.close(); } catch (_) {}
      } else {
        pal.layout.layout(true);
        STATE.compsToSend = [];
        try { setStatus("Send complete."); } catch (_) {}
      }
      } catch (sendErr) {
        if (popup && popup.win) try { popup.win.close(); } catch(eClose) {}
        pal.layout.layout(true);
        STATE.compsToSend = [];
        alertIf("Send failed: " + (sendErr && sendErr.message ? sendErr.message : String(sendErr)));
      }
    };

    btnImportSelected.onClick = function(){
      if (!STATE.connected) { alertIf("Connect first."); return; }
      if (!STATE.projectId) { alertIf("Select a project first."); return; }
      var popup = IS_WIN ? { win: null, statusLabel: null, bar: null } : showCrowdinAeProgressPopup();
      function popupStatus(msg) {
        if (popup && popup.statusLabel) popup.statusLabel.text = msg || "";
      }
      function popupSetProgress(current, total) {
        if (!popup || !popup.bar) return;
        var max = (total && total > 0) ? total : 1;
        var frac = current / max;
        if (frac < 0) frac = 0;
        if (frac > 1) frac = 1;
        popup.bar.value = Math.round(100 * frac);
        try { app.refresh(); } catch (eR5) {}
      }
      function statusProxy(msg) {
        popupStatus(msg);
        setStatus(msg);
      }
      var result = importSelectedCompositionsWithProgress(statusProxy, popupSetProgress);
      if (!result.ok) {
        if (result.reason === "no_comps") alertIf("Select at least one composition (Composition tab checkboxes, or comps in Project panel).");
        else if (result.reason === "no_langs") alertIf("Select at least one language.");
        if (popup && popup.win) try { popup.win.close(); } catch (eCx) {}
        return;
      }
      statusProxy("Import complete. " + result.done + " composition(s) created.");
      if (popup && popup.bar) {
        popup.bar.value = 100;
        try { app.refresh(); } catch (eR6) {}
      }
      if (popup && popup.win) try { popup.win.close(); } catch(eC4) {}
    };

    function runFooterAiTranslation() {
      if (TMS_PROVIDER !== "phrase") {
        alertIf("AI Translation is available for Phrase TMS only.");
        return;
      }
      if (!STATE.connected) { alertIf("Connect first."); return; }
      if (!STATE.projectId) { alertIf("Select a project first."); return; }
      var comps = getSelectedComps();
      if (!comps || comps.length === 0) {
        alertIf("Select at least one composition (Composition tab checkboxes, or comps in Project panel).");
        return;
      }
      var selected = getSelectedLanguagesFromPanel();
      if (!selected.length) {
        alertIf("Select at least one language.");
        return;
      }
      var uploadTargets = getUploadTargetsFromPanel();
      if (!uploadTargets.length && selected.length) {
        uploadTargets = [];
        for (var utAi = 0; utAi < selected.length; utAi++) uploadTargets.push(selected[utAi].id);
      }
      if (!uploadTargets.length) {
        alertIf("Select at least one language.");
        return;
      }

      var phraseSteps = comps.length * selected.length;
      var totalSteps = phraseSteps + phraseSteps;
      if (totalSteps < 1) totalSteps = 1;

      var popup = showAeCrowdinProgressPopup();
      if (!popup || !popup.win) {
        alertIf("Could not open the progress window.");
        return;
      }
      pumpProgressUi(popup, 0, "AI Translation: uploading strings…");

      function statusProxy(msg) {
        var pct = popup && popup.bar ? popup.bar.value : 0;
        updateProgressPopup(popup, pct, msg || "");
        setStatus(msg || "");
      }
      function impProgress(cur, tot) {
        var frac = (tot && tot > 0) ? (cur / tot) : 0;
        updateProgressPopup(popup, 82 + frac * 17, "AI Translation: importing…");
      }

      try {
        if (!exportStringsForComps(comps, uploadTargets, statusProxy, null, false)) {
          if (popup.win) try { popup.win.close(); } catch (eCl3) {}
          return;
        }

        pumpProgressUi(popup, 36, "AI Translation: running Language AI…");
        var step = 0;
        for (var ac = 0; ac < comps.length; ac++) {
          var compA = comps[ac];
          var fk = safeFileKeyForComp(compA);
          var compLabel = (compA.name != null) ? String(compA.name) : fk;
          for (var li = 0; li < selected.length; li++) {
            var lang = selected[li];
            var langLabel = lang.name || lang.id;
            var fromPct = 36 + (step / Math.max(1, phraseSteps)) * 44;
            var msgPhrase = "AI Translation: sending to Phrase — " + compLabel + " \u2192 " + langLabel + "…";
            pumpProgressUi(popup, fromPct, msgPhrase);
            pulseProgressPopup(popup, fromPct, fromPct + 2, msgPhrase, 3);
            var trStatus = function(msg) {
              updateProgressPopup(popup, fromPct, msg || msgPhrase);
              setStatus(msg || msgPhrase);
            };
            if (!phraseRunAutoTranslate(fk, [lang.id], trStatus)) {
              if (popup.win) try { popup.win.close(); } catch (eAt) {}
              return;
            }
            updateProgressPopup(popup, fromPct + 3, "AI Translation: received — " + langLabel);
            step++;
          }
        }

        pumpProgressUi(popup, 82, "AI Translation: duplicating compositions…");
        var result = importSelectedCompositionsWithProgress(statusProxy, impProgress, {
          progressOffset: phraseSteps,
          progressTotal: totalSteps,
          statusPrefix: "AI Translation: importing",
          comps: comps,
          selected: selected
        });
        if (!result.ok) {
          if (popup.win) try { popup.win.close(); } catch (eAt2) {}
          return;
        }
        updateProgressPopup(popup, 100, "AI Translation complete. " + result.done + " composition(s) created.");
        setStatus("AI Translation complete. " + result.done + " composition(s) created.");
      } catch (aiErr) {
        alertIf("AI Translation failed:\n" + (aiErr && aiErr.message ? aiErr.message : String(aiErr)));
      } finally {
        if (popup && popup.win) try { popup.win.close(); } catch (eFin) {}
        try { pal.layout.layout(true); } catch (eLay) {}
      }
    }

    function runFooterPseudoTranslation() {
      if (TMS_PROVIDER !== "crowdin_team" && TMS_PROVIDER !== "crowdin_enterprise") {
        alertIf("Pseudo Translation is available for Crowdin only.");
        return;
      }
      if (!STATE.connected) { alertIf("Connect first."); return; }
      if (!STATE.projectId) { alertIf("Select a project first."); return; }
      var comps = getSelectedComps();
      if (!comps || comps.length === 0) {
        alertIf("Select at least one composition (Composition tab checkboxes, or comps in Project panel).");
        return;
      }
      var selected = getSelectedLanguagesFromPanel();
      if (!selected.length) {
        alertIf("Select at least one language.");
        return;
      }
      var uploadTargets = getUploadTargetsFromPanel();
      if (!uploadTargets.length && selected.length) {
        uploadTargets = [];
        for (var utPs = 0; utPs < selected.length; utPs++) uploadTargets.push(selected[utPs].id);
      }
      if (!uploadTargets.length) {
        alertIf("Select at least one language.");
        return;
      }
      var fileKeys = [];
      for (var fkI = 0; fkI < comps.length; fkI++) {
        fileKeys.push(safeFileKeyForComp(comps[fkI]));
      }
      var totalSteps = 1 + comps.length * selected.length;
      if (totalSteps < 1) totalSteps = 1;

      var popup = showAeCrowdinProgressPopup();
      if (!popup || !popup.win) {
        alertIf("Could not open the progress window.");
        return;
      }
      pumpProgressUi(popup, 0, "Pseudo Translation: uploading strings…");

      function statusProxy(msg) {
        var pct = popup && popup.bar ? popup.bar.value : 0;
        updateProgressPopup(popup, pct, msg || "");
        setStatus(msg || "");
      }
      function impProgress(cur, tot) {
        var frac = (tot && tot > 0) ? (cur / tot) : 0;
        updateProgressPopup(popup, 55 + frac * 44, "Pseudo Translation: importing…");
      }

      try {
        if (!exportStringsForComps(comps, uploadTargets, statusProxy, null, false)) {
          if (popup.win) try { popup.win.close(); } catch (eCl3) {}
          return;
        }

        pumpProgressUi(popup, 38, "Pseudo Translation: building on Crowdin (1–3 min)…");
        var pseudoData = crowdinRunPseudoTranslate(fileKeys, statusProxy);
        if (!pseudoData || !hasAnyPseudoFiles(pseudoData.files)) {
          if (popup.win) try { popup.win.close(); } catch (ePs) {}
          return;
        }

        pumpProgressUi(popup, 55, "Pseudo Translation: duplicating compositions…");
        var result = importSelectedCompositionsWithProgress(statusProxy, impProgress, {
          progressOffset: 1,
          progressTotal: totalSteps,
          statusPrefix: "Pseudo Translation: importing",
          comps: comps,
          selected: selected,
          pseudoItemsByFileKey: pseudoData.files
        });
        if (!result.ok) {
          if (result.reason === "no_comps") alertIf("Select at least one composition.");
          else if (result.reason === "no_langs") alertIf("Select at least one language.");
          if (popup.win) try { popup.win.close(); } catch (ePs2) {}
          return;
        }
        updateProgressPopup(popup, 100, "Pseudo-localization complete.");
        setStatus("Pseudo-localization complete. " + result.done + " composition(s) created.");
        alertIf(
          "Pseudo-localization complete (" + result.done + " comp(s)).\n\n" +
          "The new text uses accent-style TEST characters (e.g. ÇÔÑÑÉÇŢ), not a real language.\n" +
          "This is for layout/overflow checks before you translate.\n\n" +
          "For real translations: translate in Crowdin, then use Import Selected."
        );
      } catch (pseudoErr) {
        alertIf("Pseudo Translation failed:\n" + (pseudoErr && pseudoErr.message ? pseudoErr.message : String(pseudoErr)));
      } finally {
        if (popup && popup.win) try { popup.win.close(); } catch (eFin) {}
        try { pal.layout.layout(true); } catch (eLay) {}
      }
    }

    function onFooterTmsActionClick() {
      try {
        setStatus("Starting TMS action (v" + PLUGIN_VERSION + ")…");
        if (TMS_PROVIDER === "phrase") runFooterAiTranslation();
        else if (TMS_PROVIDER === "crowdin_team" || TMS_PROVIDER === "crowdin_enterprise") runFooterPseudoTranslation();
        else alertIf("Connect to Phrase or Crowdin first, then choose a project.");
      } catch (eTmsClick) {
        alertIf("TMS action failed:\n" + (eTmsClick && eTmsClick.message ? eTmsClick.message : String(eTmsClick)));
      }
    }
    btnFooterTmsAction.onClick = onFooterTmsActionClick;

    // ---------- Onboarding: show step 2 (inline project chooser) ----------
    function showOnboardingStep2Shell() {
      step0Group.visible = false;
      step1Group.visible = false;
      step2Group.visible = true;
      onboardingPanel.text = "Choose a project";
    }

    function phraseOnboardContinueFromServer(userInitiated) {
      if (!isPhraseAlreadyConnected()) return false;
      STATE.connected = true;
      setStatus("Phrase connected — loading projects…");
      var ps = loadProjects(setStatus);
      if (!ps || !ps.length) {
        if (!userInitiated) return false;
        showOnboardingStep2Shell();
        setStatus("Connected — project list empty or unreadable. Click Phrase → OK to retry.");
        alertIf(
          "Phrase login succeeded on the server, but the project list did not load in After Effects.\n\n" +
          "• Confirm projects exist at cloud.memsource.com for this account\n" +
          "• Choose Phrase and click OK again (do not use Disconnect unless you want a new login)"
        );
        try { pal.layout.layout(true); } catch (eP2) {}
        return false;
      }
      fillProjectsOnboard(ps);
      setStatus("Choose a project.");
      return true;
    }

    function fillProjectsOnboard(ps) {
      showOnboardingStep2Shell();
      // Populate dropdown with available projects
      try {
        if (ddOnboardProjects) {
          // Clear existing items
          while (ddOnboardProjects.items.length > 0) {
            ddOnboardProjects.remove(0);
          }
          for (var i = 0; i < ps.length; i++) {
            var it = ddOnboardProjects.add("item", ps[i].name);
            it._project = ps[i];
          }
          if (ddOnboardProjects.items.length > 0) ddOnboardProjects.selection = 0;
        }
      } catch (eDD) {}
      pal.layout.layout(true);
    }

    function phraseOauthOnDone(ok) {
      if (!ok) {
        if (TMS_PROVIDER === "phrase" && isPhraseAlreadyConnected()) {
          phraseOnboardContinueFromServer(true);
        }
        return;
      }
      phraseOnboardContinueFromServer(true);
    }

    function crowdinOauthOnDone(ok) {
      if (!ok) return;
      STATE.connected = true;
      var ps = loadProjects(setStatus);
      if (ps && ps.length) fillProjectsOnboard(ps);
      else {
        showOnboardingStep2Shell();
        setStatus("Connected — choose a project or retry loading.");
      }
    }

    function doOauthThenProjects(mode) {
      if (TMS_PROVIDER === "phrase" && isPhraseAlreadyConnected()) {
        phraseOnboardContinueFromServer(true);
        return;
      }
      var onDone = (TMS_PROVIDER === "phrase") ? phraseOauthOnDone : crowdinOauthOnDone;
      oauthConnect(setStatus, mode, onDone);
    }

    btnConnectTeam.onClick = function() {
      setTmsProvider("crowdin_team");
      updateTmsUiLabels();
      doOauthThenProjects("team");
    };
    btnConnectEnterprise.onClick = function() {
      setTmsProvider("crowdin_enterprise");
      updateTmsUiLabels();
      doOauthThenProjects("enterprise");
    };

    btnOnboardCancel.onClick = function() {
      showOnboardingStep0();
      pal.layout.layout(true);
    };

    btnOnboardOK.onClick = function() {
      if (!ddOnboardProjects || !ddOnboardProjects.selection) return;
      var p = ddOnboardProjects.selection._project;
      if (!p) return;
      step2Group.visible = false;
      onboardingGroup.visible = false;
      mainGroup.visible = true;
      tabs.selection = 0;
      contentStack.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 260] : [-1, 260];
      onboardingGroup.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 260] : [-1, 260];
      pal.layout.layout(true);
      if (pal.layout.resize) pal.layout.resize();
      if (pal instanceof Window) pal.size = [560, 290];
      try { $.sleep(1000); } catch (e) {}
      setStatus("Loading project…");
      selectProject(p.id, p.name, setStatus);
      fillLangs(loadLanguages(setStatus));
      fillProjects(STATE.projects);
      fillLangs(STATE.languages);
      updateTmsUiLabels();
      setStatus("Ready.");
      pal.layout.layout(true);
    };

    // ---------- Initial view: onboarding vs main ----------
    if (STATE.connected && STATE.projectId) {
      onboardingGroup.visible = false;
      mainGroup.visible = true;
      tabs.selection = 0;
      contentStack.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 260] : [-1, 260];
      onboardingGroup.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 260] : [-1, 260];
      STATE.projects = loadProjects(setStatus);
      if (STATE.projects && STATE.projects.length) fillProjects(STATE.projects);
      fillLangs(loadLanguages(setStatus));
      updateTmsUiLabels();
      setStatus("Ready.");
      pal.layout.layout(true);
      if (pal.layout.resize) pal.layout.resize();
      if (pal instanceof Window) pal.size = [560, 290];
    } else {
      onboardingGroup.visible = true;
      mainGroup.visible = false;
      // Always show TMS picker first so Crowdin and Phrase stay visible (saved TMS_PROVIDER only affects step 1 after a choice).
      showOnboardingStep0();
      contentStack.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 220] : [-1, 220];
      onboardingGroup.preferredSize = CONTENT_W > 0 ? [CONTENT_W, 220] : [-1, 220];
      if (pal instanceof Window) pal.size = [560, 280];
    }

    // Force layout so onboarding content is centered on first paint (before show).
    pal.layout.layout(true);
    if (pal.layout.resize) pal.layout.resize();
    if (onboardingGroup.visible && onboardingPanel.layout) {
      onboardingPanel.layout.layout(true);
      if (stepStack.layout) stepStack.layout.layout(true);
    }

    $.global.CultConnectorAE_pendingUpdateInfo = null;
    $.global.CultConnectorAE_silentUpdateCheck = function () {
      try {
        if ($.global.CultConnectorAE_lblNewVersion) {
          refreshNewVersionLinkUi($.global.CultConnectorAE_lblNewVersion, setStatus);
          try { pal.layout.resize(); } catch (eRz) {}
        }
      } catch (eChk) {}
    };
    try {
      app.scheduleTask("$.global.CultConnectorAE_silentUpdateCheck()", 1200, false);
    } catch (eSch) {}

    if (pal instanceof Window) { pal.center(); pal.show(); }
    return pal;
  }

  buildUI(thisObj);

})(this);