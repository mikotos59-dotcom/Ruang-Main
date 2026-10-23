# Ruang Main

Launcher game jadul untuk Windows: Arcade/Neo Geo, NES, SNES, Game Boy/Color, GBA, dan PS1.
Kamu cukup menaruh file game di folder **Games**, lalu klik dan main.

Pengembang: @SuS_X_x

## Cara pakai

1. Jalankan `Ruang Main.exe`.
2. Klik **Folder game** di menu kiri. Di dalamnya sudah ada subfolder per konsol:

   | Folder | File yang didukung |
   |---|---|
   | `Arcade` | set ROM .zip arcade / Neo Geo (contoh `mslug.zip`) |
   | `NES` | .nes .fds |
   | `SNES` | .sfc .smc |
   | `GB` | .gb .gbc |
   | `GBA` | .gba |
   | `PS1` | .cue + .bin, .chd, .pbp, .m3u (multi-disc) |

   File .zip / .7z juga boleh, isinya dicek untuk menentukan konsolnya.
3. Game langsung muncul di pustaka, tanpa perlu restart.

### Rapikan otomatis

Tidak perlu hafal folder. Taruh saja file di folder `Games` (atau di folder yang keliru), Ruang Main
akan memeriksa isinya lalu memindahkannya ke folder konsol yang benar. Contoh: `Metal Slug X.7z`
berisi `.cue` + `.bin` dipindah ke `PS1`. Statistik, foto, dan cover ikut pindah. Save state dari
konsol yang salah disimpan ke `Saves/_cadangan-konsol-lama` karena tidak cocok untuk konsol barunya.

Set ROM arcade (.zip berisi chip ROM) tidak selalu bisa dikenali dari isinya. Kalau yang muncul salah,
buka detail game dan pilih konsolnya di kolom **Konsol**. Fitur rapikan bisa dimatikan di Tentang & pengaturan.

### Pantau folder Downloads

Unduh game lewat browser seperti biasa. Begitu file game (atau BIOS seperti `neogeo.zip`) muncul di
folder Downloads, Ruang Main menampilkan kotak **Ditemukan di Downloads** dengan tombol **Pindahkan**.
File lama yang sudah ada sebelum fitur ini aktif tidak ditawarkan otomatis; pakai **Periksa sekarang**
di pengaturan. Folder yang dipantau bisa diganti, dan ada opsi pindahkan tanpa bertanya.

### Tautan saya

Simpan situs favoritmu di menu **Tautan saya**. Tautan dibuka di browser biasa.

### BIOS

- **Neo Geo** (Metal Slug, KOF, Samurai Shodown) butuh `neogeo.zip` di folder **BIOS**.
- **PS1** tidak wajib BIOS. Kalau punya `scph5501.bin` / `scph1001.bin`, taruh di folder BIOS agar kompatibilitas lebih baik.

### Cover

Urutan sumber cover: gambar pilihanmu (Ganti cover) → gambar bernama sama di samping file game (`mslug.png`) → cover otomatis dari libretro-thumbnails (non-arcade, butuh internet) → layar terakhir saat kamu berhenti main.

## Saat bermain

| Tombol | Fungsi |
|---|---|
| Esc / Select + Start (stik) | Menu jeda: simpan ke slot, muat slot, foto layar, mulai ulang, kembali |
| F5 | Simpan cepat ke Slot 1 |
| F9 | Muat Slot 1 |
| F12 | Foto layar (masuk Galeri) |
| F11 | Layar penuh |

**Mode grafis** (menu jeda → Mode grafis, diingat per game): Asli (piksel tajam), Halus (ScaleHQ),
TV jadul (scanline), dan TV tabung melengkung. Mode bawaan untuk game baru diatur di pengaturan.

- **Simpan otomatis**: setiap kali kembali ke pustaka atau menutup aplikasi, posisi terakhir disimpan. Tombol **Lanjutkan** membawamu ke titik itu. Ada juga cadangan otomatis tiap 5 menit.
- **Save bawaan game** (SRAM / memory card) ikut disalin ke folder `Saves`.
- Atur tombol keyboard/stik lewat ikon stik di bar bawah emulator (gerakkan mouse ke bawah layar).

## Di pustaka

- Pilih game, lalu tombol **A** di stik untuk membuka detail; **Y** untuk langsung main; **B** untuk menutup.
- **Statistik**: total jam main, game paling sering dimainkan, grafik 7 hari, riwayat sesi.
- **Galeri**: semua foto layar, bisa dijadikan cover game.

## Lokasi data

Versi zip (portable) menyimpan semuanya di `RuangMain-Data` di samping file .exe:
`Games`, `BIOS`, `Saves`, `Screenshots`, `Covers`, dan `ruangmain.json` (statistik & pengaturan).
Versi installer menyimpan di `Dokumen\Ruang Main` bila folder instalasi tidak bisa ditulisi.

## Untuk pengembang

```
npm install          # sekaligus menyalin mesin emulator & font ke app/
npm start            # jalankan versi pengembangan
npm run build:win    # buat installer + zip Windows di folder dist/
```

Struktur:
- `main.js`: proses utama (protokol `rm://`, pemindai folder, IPC, simpan data)
- `lib/library.js`: deteksi konsol, pembaca ZIP, paket .cue+.bin
- `app/`: tampilan pustaka (`index.html`, `app.js`) dan pemutar (`play/`)
- `scripts/setup.js`: menyalin EmulatorJS + core dari node_modules

## Lisensi

Ruang Main memakai [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) dan core libretro (FBNeo, FCEUmm, Snes9x, Gambatte, mGBA, PCSX-ReARMed), sehingga dirilis di bawah GPL-3.0-or-later. Catatan: lisensi FBNeo sendiri melarang penggunaan komersial.

Ruang Main tidak menyertakan dan tidak mengunduh game atau BIOS. Kamu bertanggung jawab atas file yang kamu masukkan.
