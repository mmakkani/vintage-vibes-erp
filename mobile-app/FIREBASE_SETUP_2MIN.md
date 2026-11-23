# VV Connect Native App — FREE Google Firebase (FCM) Setup (2 Minutes)

APK bina Firebase ke bhi **asli Android OS permissions (`Notifications`, `Microphone`, `Camera`, `Contacts`, `Location`)**, WebRTC calls, aur foreground `VVKeepAliveService` ke sath poori tarah chalta hai.

Jab aap chahein ke **app bilkul swipe-kill karne ke baad bhi screen-off full-screen ring aaye**, to yeh 2-minute bilkul **FREE (`$0`) Firebase** steps follow karein:

---

## Step 1: Free Firebase Project & `google-services.json` (Android App Side)
1. Google Chrome mein https://console.firebase.google.com kholein (apne Gmail se).
2. **Create a project** -> Naam dein `vintage-vibes-connect` -> Create.
3. Android icon par click karein -> **Android package name** bilkul exact likhein:
   `com.vintagevibes.connect`
4. **`google-services.json`** download karein.
5. GitHub repository (`mmakkani/vintage-vibes-erp`) -> **Settings -> Secrets and variables -> Actions -> New repository secret**:
   - Name: `FIREBASE_GOOGLE_SERVICES_JSON_B64`
   - Value: `google-services.json` ko Base64 string mein convert kar ke paste karein:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))
     ```
   - Phir GitHub Actions -> **Build VV Connect Native Android APK** -> **Run workflow** dabayein — naya APK khud-ba-khud FCM enabled ban kar `https://vintagevibesgk.com/live/vv-connect.apk` par aa jayega!

---

## Step 2: Server Service Account Key (Dubai Server Side)
1. Firebase Console -> Gear Icon -> **Project settings -> Service accounts**.
2. **Generate new private key** dabayein (JSON file download hogi).
3. Us JSON file ko Dubai Server par save karein:
   `C:\vintage-vibe\.data\firebase_service_account.json`
   *(ya `FIREBASE_SERVICE_ACCOUNT_JSON` env var mein set karein)*
4. Server ko reload karein (`https://vintagevibesgk.com/api/live/push/native-status` par `"fcmConfigured": true` show ho jayega!).

---

## Apple iPhone (iOS) Build Notes
- Capacitor iOS project `mobile-app/ios/App` tayyar hai (Permissions `Info.plist` aur `UIBackgroundModes`: `audio`, `voip`, `remote-notification` added hain).
- Apple iOS App Store / TestFlight / Ad-Hoc `.ipa` compile karne ke liye macOS Xcode + Apple Developer Account (`$99/yr` Apple ki official fee) zaroori hota hai.
- Firebase Console mein iOS app (`com.vintagevibes.connect`) add kar ke apni Apple `.p8` APNs key upload karne se same `/api/live/push/register-native-token` endpoint iPhone par bhi APNs notifications bhejega.
