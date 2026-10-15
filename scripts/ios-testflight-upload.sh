#!/bin/bash
# Lädt die smyst.com-iOS-App (com.smyst.app) zu App Store Connect TestFlight hoch.
# Voraussetzungen auf dem Rechner:
#   - Xcode mit installiertem "Apple Distribution: iMild LLC (443R27FNHX)"-Zertifikat (Schlüsselbund)
#   - Provisioning-Profil "smyst App Store" in ~/Library/Developer/Xcode/UserData/Provisioning Profiles/
#   - App-Store-Connect-API-Schlüssel "smyst Upload" unter ~/.appstoreconnect/private_keys/
# Details: docs/TESTFLIGHT.md
set -euo pipefail
cd "$(dirname "$0")/.."

API_KEY_ID="LCNMTW4TCQ"
API_ISSUER="649c9c72-6c69-43cc-92ee-a1e41ecb9c16"
TEAM="443R27FNHX"
IDENTITY="Apple Distribution: iMild LLC (443R27FNHX)"
PROFILE="smyst App Store"
BUILD_NUM="$(date +%Y%m%d%H%M)"
OUT="/tmp/smyst_ipa_$BUILD_NUM"

echo "== Frontend bauen (Produktion) =="
VITE_CANONICAL_HOST=https://smyst.com \
VITE_API_BASE_URL=https://smyst-api.zeabur.app \
VITE_API_FALLBACK_BASE_URL=https://api.smyst.com \
VITE_AUTH_BASE_URL=https://smyst-api.zeabur.app/auth \
npm run build

echo "== Capacitor-Sync (ios) =="
npx cap sync ios

echo "== Archiv bauen (Build $BUILD_NUM) =="
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "/tmp/smyst.xcarchive" \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_IDENTITY="$IDENTITY" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE" \
  CURRENT_PROJECT_VERSION="$BUILD_NUM"

echo "== IPA exportieren =="
mkdir -p "$OUT"
cat > "/tmp/smyst_export_$BUILD_NUM.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key><string>app-store-connect</string>
    <key>teamID</key><string>$TEAM</string>
    <key>signingStyle</key><string>manual</string>
    <key>signingCertificate</key><string>Apple Distribution</string>
    <key>provisioningProfiles</key>
    <dict><key>com.smyst.app</key><string>$PROFILE</string></dict>
    <key>uploadSymbols</key><true/>
    <key>destination</key><string>export</string>
</dict>
</plist>
PLIST
xcodebuild -exportArchive \
  -archivePath /tmp/smyst.xcarchive \
  -exportOptionsPlist "/tmp/smyst_export_$BUILD_NUM.plist" \
  -exportPath "$OUT"

echo "== Zu TestFlight hochladen =="
xcrun altool --upload-app -f "$OUT/App.ipa" -t ios \
  --apiKey "$API_KEY_ID" --apiIssuer "$API_ISSUER" --output-format json

echo "Fertig. Build $BUILD_NUM wird in App Store Connect verarbeitet (Dauer: einige Minuten)."
