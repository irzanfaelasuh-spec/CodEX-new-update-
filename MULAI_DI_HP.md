# Memasang CodEX AI dari HP Android

## 1. Unggah proyek ke GitHub

1. Unduh ZIP pembaruan CodEX AI dan ekstrak di File Manager Android.
2. Buka repository `Terminal-Codex`.
3. Pilih **Add file → Upload files**.
4. Unggah isi folder proyek ke root repository, termasuk `src`, `public`, `package.json`, `capacitor.config.ts`, dan `.github/workflows`.
5. Jika GitHub menanyakan file yang sudah ada, pilih untuk mengganti file proyek lama dengan versi pembaruan ini.
6. Commit perubahan pada branch `main`.

Pastikan yang diunggah adalah isi folder yang sudah diekstrak, bukan ZIP sumber sebagai satu file.

## 2. Deploy website

1. Buka **Settings → Pages** di repository.
2. Pilih **GitHub Actions** pada bagian Build and deployment.
3. Buka tab **Actions**.
4. Jalankan **Deploy CodEX AI to GitHub Pages**.
5. Setelah berhasil, buka alamat Pages yang ada di ringkasan deployment.

## 3. Siapkan Gemini

1. Buat API key di [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Login atau buat akun CodEX.
3. Masuk ke **Settings**, lalu masukkan API key untuk akun tersebut.
4. Masuk ke **Models**, lalu tekan **Refresh Model Catalogue** untuk menampilkan model asli yang tersedia bagi API key itu.

API key disimpan terpisah menurut akun pada browser/perangkat tersebut. Akun lain tidak otomatis memakai key akun sebelumnya. Namun karena ini aplikasi statis, key masih bisa dilihat oleh orang yang memiliki akses ke profil browser atau developer tools. Jangan gunakan key rahasia organisasi atau key yang dipakai bersama.

## 4. Cara memakai fitur baru

- **Image / file upload:** buka Console, tekan **ATTACH**, pilih gambar, PDF, DOCX, ZIP, JSON, dokumen teks atau source code, tulis pertanyaan, lalu kirim.
- **ZIP Explorer:** isi ZIP dibuka secara lokal. Daftar file ditampilkan ke AI; isi text/source dan DOCX dibaca, sedangkan gambar dan PDF yang didukung dikirim sebagai lampiran.
- **Generated project:** minta AI membuat setiap file dengan path relatif seperti `index.html`, `src/main.js`, dan `styles/main.css`. File code block dengan atribut `filename="..."` masuk ke Files.
- **Canvas:** jika AI membuat file HTML dan Live Canvas aktif, preview akan terbuka otomatis. Canvas memakai iframe sandbox, jadi beberapa API browser mungkin tidak tersedia.
- **Project ZIP:** buka Files, tekan **DOWNLOAD PROJECT ZIP**, lalu simpan ZIP hasilnya di HP.
- **Plugins:** buka menu Plugins dan aktifkan/nonaktifkan tool yang dibutuhkan.
- **Memory:** buka Memory untuk menyimpan nama panggilan, hobi, minat dan catatan yang ingin digunakan CodEX sebagai konteks.
- **New Chat:** tekan tombol New Chat. Percakapan lama disimpan dan dapat dibuka lagi dari History jika Chat Archive aktif.
- **Logout:** pilih Sign out lalu konfirmasi Yes, Leave atau No, Stay.

## 5. Token

Setiap akun mendapat meter yang sama: **20.000 token harian** dan **100.000 token mingguan**. Reset harian pukul 00.00 WIB dan reset mingguan setiap Senin pukul 00.00 WIB. Pada 100%, permintaan baru dihentikan sampai reset terkait.

Meter ini masih disimpan di browser. Pengguna yang mengubah data browser atau jam perangkat bisa melewatinya. Pembatasan yang benar-benar tidak bisa diedit membutuhkan backend server; GitHub Pages saja tidak bisa menjaminnya.

## 6. Membuat APK

1. Pastikan project sudah di-commit pada repository.
2. Buka **Actions**.
3. Pilih **Build CodEX AI Android APK**.
4. Tekan **Run workflow**.
5. Setelah proses berhasil, buka hasil run dan unduh artifact **CodEX-AI-APK**.
6. Ekstrak ZIP artifact. File aplikasi yang dicari bernama `app-debug.apk`.

Artifact ZIP berisi APK, bukan source code ZIP. Build ini adalah debug APK untuk pengujian, bukan APK Play Store.
