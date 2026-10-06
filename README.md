# Blog & Podcast Audio Website

Website statis (HTML5 + TailwindCSS + Vanilla JS + HTMX + Lucide) untuk blog dan podcast.
Tanpa backend, database, CMS, atau build step. Semua konten adalah file di repository GitHub publik.

- Teks & JSON (Markdown, manifest) dibaca dari **GitHub Raw**
- Audio & gambar dimuat dari **jsDelivr CDN** (repository yang sama)

## Menjalankan

Website memakai ES Modules dan `fetch`, jadi harus dibuka lewat server HTTP (bukan `file://`):

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

Selama `owner`/`repository` di `assets/js/config.js` masih `USERNAME`/`REPOSITORY`,
website membaca file lokal di sebelahnya, sehingga 3 post dan 3 episode contoh langsung tampil.

## Konfigurasi (satu tempat)

Edit **hanya** `assets/js/config.js`:

```js
owner: "username-github-anda",
repository: "nama-repository",
branch: "main",
siteName: "NAMA ANDA",
siteUrl: "https://username.github.io/nama-repository/", // untuk canonical & og:url
```

Semua URL Raw dan jsDelivr dibangun dari nilai ini oleh `assets/js/github.js`
(`buildRawUrl`, `buildAudioUrl`, `buildAssetUrl`). `source` bisa `"auto"` (default), `"github"`, atau `"local"`.

## Menambah blog baru

1. Buat `content/posts/my-post.md` dengan frontmatter:
   ```yaml
   ---
   title: "My Post"
   description: "Short description."
   date: "2026-10-05"
   author: "Your Name"
   tags:
     - writing
   published: true
   ---
   ```
2. Tambahkan entri ke `content/posts.json` (`slug`, `title`, `description`, `date`, `tags`, `file`, `published`).
   Field `readingTime` (menit) opsional; jika kosong dihitung otomatis.
3. Commit
4. Push — website membaca konten baru (Raw URL ter-cache sekitar 5 menit).

Judul `# H1` di awal Markdown yang sama dengan `title` otomatis disembunyikan; H1 lain diturunkan menjadi H2.
Gambar relatif (mis. `../../podcast/covers/x.svg`) dirujuk dari lokasi file Markdown dan dimuat via jsDelivr.

## Menambah podcast baru

1. Taruh MP3 di `audio/`
2. Tambahkan entri ke `podcast/episodes.json`:
   `id`, `episode`, `title`, `description`, `date`, `duration`, `audio`, `cover`, `tags`, `published`.
   Opsional: `showNotes` (mis. `podcast/episodes/ep-004.md`), `author`, `explicit`, `season`, `episodeType`.
3. (Opsional) tambahkan show notes Markdown dan cover di `podcast/covers/`
4. Commit
5. Push

Isi `duration` dengan durasi asli file (`32:15` atau `1:02:03`). Player menampilkan durasi sebenarnya setelah audio dimuat.

## Audio URL

Audio **tidak** diputar dari GitHub Raw. `buildAudioUrl("audio/episode-001.mp3")` menghasilkan:

```
https://cdn.jsdelivr.net/gh/USERNAME/REPOSITORY@main/audio/episode-001.mp3
```

Catatan jsDelivr: branch di-cache cukup lama (jam); setelah mengganti file dengan nama sama, purge lewat
`https://purge.jsdelivr.net/gh/USERNAME/REPOSITORY@main/audio/episode-001.mp3` atau gunakan nama file baru.
Ada batas ukuran per file di jsDelivr (sekitar 50 MB); untuk file lebih besar, isi `audio` dengan URL `https://...` penuh.

## Struktur

```
index.html blog.html post.html podcast.html episode.html about.html
partials/header.html footer.html     header/footer bersama (dimuat HTMX)
assets/css/styles.css                token warna, tipografi, komponen
assets/js/
  config.js        satu-satunya konfigurasi repository
  github.js        pembangun URL Raw/jsDelivr, fetch + cache
  markdown.js      frontmatter, marked + DOMPurify (disanitasi)
  ui.js            helper bersama: el(), tanggal, SEO meta, state, filter
  blog.js          manifest, PostCard, index/search/tag, detail, About
  podcast.js       metadata, EpisodeCard, index, detail + show notes
  player.js        satu <audio>: player penuh, mini player, tombol PLAY
  app.js           entry point: header/footer, tema, routing per halaman
  tailwind.config.js
content/  podcast/  audio/           konten
```

Keputusan teknis:
- `ui.js` dan `tailwind.config.js` ditambahkan agar helper tidak terduplikasi di `blog.js`/`podcast.js`.
- **TailwindCSS** memakai Play CDN (tanpa build step). Untuk produksi ketat, ganti dengan CSS hasil Tailwind CLI.
- **HTMX** dipakai untuk memuat header/footer bersama (satu sumber navigasi, tanpa duplikasi di 6 halaman).
  Jika HTMX gagal dimuat, `app.js` memuatnya lewat `fetch`.
- **Markdown**: `marked` dan `DOMPurify` (versi dipin, dimuat dari jsDelivr hanya di halaman yang memerlukan).
- **localStorage** hanya untuk `theme`, `volume`, dan `lastPlayed`; website tetap berfungsi tanpanya.
- Audio berhenti saat pindah halaman (tidak ada SPA). Mini player menampilkan episode terakhir
  dalam keadaan pause di posisi tersimpan.

## Batasan yang perlu diketahui

- Meta SEO dan `og:*` untuk post/episode diisi oleh JavaScript. Google umumnya membacanya,
  tetapi crawler pratinjau media sosial yang tidak menjalankan JS hanya melihat meta default di HTML.
- Repository harus publik.
- `siteUrl` perlu diisi agar canonical benar; kosongkan untuk memakai alamat tempat halaman dibuka.
- Deploy: GitHub Pages, Cloudflare Pages, Netlify, atau hosting statis lain. Cukup unggah folder ini.
