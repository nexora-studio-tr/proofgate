# Kurulum

## Yerel kullanım

Node.js 24 serisinde 24.15 veya üzeri, npm, Git ve çalışan Docker Linux motoru gerekir. Windows'ta Docker Desktop'ı Linux-container modunda açın. Ayrı kaynak klasöründe `npm run setup`, ardından `npm start` çalıştırın.

`.proofgate/launch-url` dosyasındaki özel bağlantıyı açın; paylaşmayın. Tek kullanımlık bağlantı tarayıcı geçmişinden kaldırılır. Varsayılan parola veya açık kayıt yoktur. CLI/MCP kullanırken sunucu açık kalmalıdır; tüm istemciler aynı kuyruğa bağlanır. Ayrı kurulum için `--data MUTLAK_KLASOR` kullanın; yerel/ekip/demo modlarını aynı veritabanında değiştirmeyin.

## Kendi projeniz

`register DEPO --policy POLITIKA.json` ile tam Git kökünü kaydedin. Politika aday kodun dışında tutulur; onaylı kopya kontrol veritabanına alınır. [Örnek politikayı](../examples/access-control/proofgate-policy.json) test yollarınız, zorunlu adlarınız, regresyon testiniz ve beklenen doğrulama mesajınızla düzenleyin.

İlk adaptör tam Vitest 5.0.5, tek npm paketi ve v3 kilit dosyası ister. Yalnızca bütünlük bilgisi bulunan herkese açık npm paketleri desteklenir. `doctor --build --project ID` bağımlılık imajını hazırlar; betikler ve kimlik bilgileri aktarılmaz. Deneme sırasında ağ kapalıdır. Projenin keyfi Vitest/Vite ayarı yüklenmez; kayıtlı test listesiyle bağımsız Node ayarı kullanılır. Test adları kapsam içinde benzersiz olmalıdır.

Eski kodda bulunmayan API/yardımcı/bağımlılık nedeniyle karşılaştırma yapılamıyorsa sonuç belirsizdir. Önceden başarısız başlangıç testleri de geçişi engeller. Kaynak sınırı 500 dosya, dosya başına 512 KiB ve toplam 4 MiB'dir. Yeni dosyalar açıkça seçilir. Gizli dosyalar, `.env*`, çalışma verileri, bağımlılıklar ve başka projeler alınmaz; symlink/submodule reddedilir. Dışarıya paylaşmadan önce raporu inceleyin; filtreler bütün gizli bilgileri bulamaz.

## Sonuç ve kaynak sınırları

`verify --project ID --base REF` mevcut dosyaları geri almaz veya commit oluşturmaz. Sonuç yalnızca sabitlenen kaynak görüntüsüne aittir. Daha sonra yapılan değişiklik eski raporu yeni çalışma alanı için geçersiz kılar.

Bir başlangıç ve üç taze eski/yeni karşılaştırması yapılır. Stryker ayrı aday ortamında kendi worker'larını kullanır; her mutasyonun ayrı container'ı olduğu iddia edilmez. Değişen üretim aralığı sınanır. Plan 25 mutasyonu geçerse mutasyonlar başlatılmaz. Kaçan mutasyonlar insan incelemesi gerektirir; hepsi gerçek ürün hatası değildir.

Varsayılan sınırlar: 2 CPU, 2 GiB RAM, 256 PID, 256 MiB geçici alan; aşama başına 120 saniye, iş başına 10 dakika. Kuyruk genel olarak sekiz, ekip başına iki işle sınırlıdır; bir supervisor tek iş çalıştırır. İptal ve yeniden başlatmada yalnızca o işe ait container'lar temizlenir. Kesilen iş yeni plan gerektirir. Docker ortak çekirdek kullanır; herkese açık düşmanca kod barındırma hedeflenmez.

Planlar 30 dakika geçerlidir. İç deneme/kaynak kayıtları bakımda yedi gün, işlem kayıtları 90 gün sonunda kaldırılır. Özellikle dışarı aktarılan `reports/` dosyaları operatör silene kadar saklanır. Harici telemetri veya model API çağrısı yoktur.

## Ekip kurulumu

```sh
node dist/apps/cli/src/index.js doctor --build --data .proofgate-team
node dist/apps/cli/src/index.js serve --team-mode --data .proofgate-team
```

Ayrı veri klasöründeki özel bağlantıdan ilk sahibi oluşturun. Parola en az 15 karakter olmalıdır. Yerel ağ dışına açarken HTTPS reverse proxy kullanın; `--host 0.0.0.0 --origin https://ALAN_ADINIZ` verin, Host/Origin başlıklarını koruyun ve 4327 portunu doğrudan açmayın. Veri klasörünü web'e açmayın. Docker erişimli supervisor güvenilir, ayrı bir işletim sistemi hesabıyla çalışmalıdır.

Ekip ekranı davet bağlantısı, rol, üye kaldırma, sahiplik devri, alan değiştirme ve yedi günlük proje anahtarlarını sağlar. Viewer iş başlatamaz. Anahtar yalnızca seçilen projeye erişir. Operatör proje eklerken ekrandaki ekip kimliğini `--team EKIP_ID --data .proofgate-team` ile belirtir. E-posta adresleri davet kimliğidir; posta kutusu bağımsız doğrulanmaz ve davetler elle iletilir.

Rol değişikliği mevcut oturumlara yansır. Sahiplik devrinde ekip oturumları yenilenir. Parola değişimi/kurtarma, oturumları, anahtarları, hesabın ürettiği bekleyen bağlantıları ve işlerini iptal eder. Kurtarma için operatör `recovery --email ADRES --data .proofgate-team` komutuyla 30 dakikalık tek kullanımlık bağlantı üretir ve özel olarak iletir.

SMTP, açık kayıt, SSO ve MFA kapsam dışıdır. Sunucu varsayılan olarak iletilen IP başlıklarına güvenmez; proxy arkasındaki istemciler aynı giriş kotasını paylaşabilir.

## Sorun giderme

- Docker yok: Linux motorunu açın, `doctor --build` çalıştırın.
- Bağımlılık imajı yok: güncel kilit için `doctor --build --project ID`.
- Kaynak değişti: yeni plan; eski yeşil sonucu yeni koda bağlamayın.
- Mutasyon sınırı: üretim kapsamını daraltın.
- Özel paket deposu ve keyfi test ayarı desteklenmez. npm workspace için incelenmiş [v2 profilini](WORKSPACE-EXECUTION.tr.md) kullan.
- Yeniden başlatma: sahipli temizlik tamamlansın; çalışan lock dosyasını silmeyin.

[English](SETUP.md) · [Güvenlik bildirimi](../SECURITY.md)
