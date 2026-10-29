# Kontrollü npm workspace doğrulaması

[English](WORKSPACE-EXECUTION.md) · [Mimari](WORKSPACE-EXECUTION-RFC.tr.md) · [Doğrulama durumu](STATUS.md)

Alpha.3, küçük bir npm monoreposundaki uygulama/test değişikliklerini doğrular. Kaynağa bağlı tek plan, değişen paketleri ve bunların dolaylı tüketicilerini seçer. Yedi deneme tüm seçim içindir; süre ve mutasyon bütçesi paket başına çoğaltılmaz.

## Örneği çalıştır

Normal [kurulumu](SETUP.tr.md) tamamla ve yerel sunucuyu açık bırak:

```sh
node dist/apps/cli/src/index.js example --workspace
node dist/apps/cli/src/index.js doctor --project PROJECT_ID
node dist/apps/cli/src/index.js verify --project PROJECT_ID --base HEAD
```

`PROJECT_ID` yerine ilk komutun verdiği ID'yi yaz. `doctor`, çalışan Docker Linux motoru ve incelenmiş dış bağımlılıklar için ağ bağlantısı gerektirir. Lockfile'dan kurulumda yaşam döngüsü betikleri kapalıdır; test konteynerleri çevrimdışıdır.

Örnekte eski izin işlevi kilitli kaynağın düzenlenmesine yanlışlıkla izin verir. Düzeltme `packages/access` içindedir; `apps/api` paketine eklenen regresyon testi eski kodda başarısız, adayda başarılı olur. `apps/audit` dolaylı tüketici olarak zorunludur. `packages/unrelated` açıkça doğrulanmamış gösterilir. Ortak koddaki kontrollü hata, Stryker'ın kendi kopyalanmış ortamında tüketici testi tarafından yakalanır.

## Kendi projen

[V2 örnek politikasını](../examples/workspace-access/proofgate-policy.json) incele, kendi testlerine göre düzenleyip aday deponun dışına kaydet:

```sh
node dist/apps/cli/src/index.js register /absolute/git-root --policy /absolute/workspace-policy.json
node dist/apps/cli/src/index.js doctor --project PROJECT_ID
```

Politika operatörün kontrolündedir; çalıştırma isteği bunu değiştiremez. Test kimliği `paket-yolu::depoya-göre-dosya::tam-test-adı` biçimindedir. Farklı paketlerde aynı test adı karışmaz. Seçilen her paketin başlangıç ve zorunlu testleri olmalıdır. Regresyon kimliği zorunlu listede bulunmalı, eski kodda onaylı hata mesajıyla assertion hatası vermelidir. Eksik test, import/kurulum çökmesi, atlanan test veya kararsız sonuç geçerli başarı oluşturmaz.

- `schemaVersion: 2`, `profile: npm-workspace-node-v1`.
- Toplam en fazla 5 seçili paket, 30 bağımsız test dosyası ve 200 zorunlu test kimliği.
- Bir B ve üç taze C/H çifti. C yalnızca kayıtlı test dosyalarını eski uygulamanın üzerine aktarır.
- Tüm iş için en fazla 25 seçili mutasyon, aşama başına 120 saniye ve toplam 600 saniye. Sınır nedeniyle dışarıda kalan mutasyonlar gizlenmez; eksik çalışma tam başarı sayılmaz.
- Değişen her dosya test veya üretim dosyası olarak bildirilmelidir. Etkilenen tüketiciler seçimden çıkarılamaz.

Plan kimliği iki kaynak görüntüsünü, politikayı, bildirimleri/lockfile'ı, grafiği ve gerekçe zincirlerini, seçimi, bağlantı haritasını, araç/çalışma zamanı sürümünü, değişmez imajları ve bütçeyi bağlar. Kaynak, politika veya imaj değişirse eski plan kuyruğa alınamaz ve çalıştırılamaz. Gözlenen npm sürümü kanıtta kaydedilir; kurulumu değişmez imaja bağlıdır.

## Desteklenen sınır

Node 24, npm lockfile v3, sabit Vitest 5.0.5 ve Stryker 10.1.1 kullanılır. Workspace bildirimi dizi olmalı; testler derleme gerektirmeyen kaynak export'larını tüketebilmelidir. Yerel paket sürümleri `X.Y.Z`; iç referanslar tam sürüm veya `*` olmalıdır. npm'nin ürettiği yerel lock bağlantıları yakalanan ad/yolla eşleşmelidir. Dış paketler kökte kurulmuş, public npm kaynağından ve bütünlük özetiyle sabitlenmiş olmalıdır.

Bildirim/lock/topoloji/yapılandırma değişimi, paket ekleme/silme/yeniden adlandırma, döngü, eksik grafik, ortak kök dosya değişimi, keyfi yerel bağlantı, paket içi dış bağımlılık ağacı ve `workspace:` protokolü bu profilde engellenir. Salt okunur inceleme daha geniş bildirimleri okuyabilir; `complete` sonucu çalıştırmaya uygunluk anlamına gelmez. pnpm/Yarn, proje kurulum/derleme betikleri, tarayıcı testleri ve özel paket depoları desteklenmez.

Bildirim grafiği tüm çalışma zamanı ilişkilerini kanıtlamaz. Politikanın test ve üretim kapsamı incelenmelidir. Sonuç genel kod doğruluğu, güvenlik veya düşmanca kod izolasyonu sertifikası değildir.

## Sonucu oku

CLI JSON/HTML çıktısı, MCP ve iki dilli panel aynı v2 kanıt kimliğini kullanır. Panel seçim nedenini, aday testlerin bulunmasını, paket sonucunu ve doğrulanmayan paketleri gösterir. H testleri geçse bile kaçan mutasyon, zayıf regresyon veya eksik ortak çalışma varken paket başarılı sayılmaz. Doğrudan başarısız paket `fail`; ortak kapı geçmemişse diğer paketler `inconclusive` kalır.

MCP altı araç olarak kalır. `get_verification`, `planHash` ve paket sonuçlarını içerir. `get_evidence` artık sayfalı `workspace` ve `links` bölümlerini de döndürür; yanıt boyutu sınırı korunur. Salt okunur inceleme iş kuyruğa almaz.

Demodaki [gerçek sentetik koşu](../examples/evidence/WORKSPACE-PROVENANCE.md), özgün sürüm ve kimlikleri korunarak gösterilir. Ziyaretçinin kodu çalıştırılmaz. V1 tek paket politikaları/raporları desteklenmeye devam eder. Eski bir workspace projesini çalıştırmadan önce incelenmiş v2 politikayla yeniden kaydet.
