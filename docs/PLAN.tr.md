# ProofGate: ürün kararı ve geliştirme sırası

Karar tarihi: 25 Ekim 2026. Mimari ve kapsam kararlarının kaydıdır; güncel uygulama ve doğrulama durumu [STATUS](STATUS.md) dosyasındadır.

## Ürün

ProofGate, Claude/Codex ile yapılan bir kod değişikliğinin testlerle ne kadar doğrulandığını gösterir. Hedef kullanıcı, AI ile kod geliştiren bireysel geliştirici ve küçük yazılım ekibidir.

Örnek: ajan bir yetki kontrolünü düzeltip test ekler. ProofGate aynı yeni testi eski kodda da çalıştırır. Test eski kodda da geçiyorsa, bu testin o hatayı ayırt etmediğini raporlar. Eski kodda beklenen doğrulama hatası oluşuyor ve yeni kodda test geçiyorsa bunu ayrı gözlem olarak kaydeder. Ardından değişen kodda kontrollü küçük hatalar oluşturarak testlerin bunlara duyarlılığını inceler.

Üç ayrı sonuç vardır: testlerin geçmesi, düzeltmeyi ayırt eden regresyon kanıtı ve seçilen kontrollü hataların yakalanması. Bunlar tek bir yanıltıcı güven puanında birleştirilmez. Rapor yalnızca kayıtlı sürüm ve sınanan kapsam için geçerlidir; hatasızlık veya güvenlik sertifikası değildir.

Fark hedefi; değişiklik, gerçek test sonuçları ve testlerin hata yakalama gücünü aynı iş akışında, kaynağı izlenebilir biçimde birleştirmek. Teknik fayda, kullanıcı ilgisi ve ödeme isteği henüz sahada doğrulanmış değildir.

## Kesin mimari kararları

| Konu | Karar |
| --- | --- |
| İlk destek | Tek paketli TypeScript/JavaScript + Node.js 24 + npm + Node modunda Vitest. Uyumlu kesin bağımlılık sürümleri ilk teknik denemede kilitlenir. |
| Kullanım | Önce yerelde çalışan sürüm; tamamlanan ürün kapsamında ayrıca küçük ekipler için kendi sunucusunda kurulum. |
| Ajan bağlantısı | Tek yerel stdio MCP sunucusu, Claude Code ve Codex için ayrı ince paketler. Temel iş akışı yaşam döngüsü hook'larına bağımlı olmayacak. |
| Çalıştırma | Kayıtlı proje kökleri, değiştirilemez kaynak görüntüsü ve Docker ile sınırlanmış Linux denemeleri. Windows kullanımı Docker Desktop üzerinden doğrulanacak. |
| Mutasyon | StrykerJS ve mevcut Vitest adaptörü. Değişen kodda bütçesi ve seçilen kapsamı açık denemeler. |
| Backend | TypeScript/Fastify; aynı iş motorunu kullanan CLI, MCP ve API. Tek sunucuda SQLite ve dosya tabanlı raporlar. |
| Arayüz | React/Vite/Radix UI. Öncelik değişiklik ve kanıt inceleme ekranı; testleri olmayan vitrin ekranı bir teslim sayılmaz. |
| Veri ve maliyet | Kaynaklar ve ham sonuçlar varsayılan olarak yerelde. Temel doğrulama ek model API'si, ücretli servis veya bulut hesabı istemeyecek. |
| Lisans ve yayın | MIT hedefleniyor. Mimari dosyaları yerelde hazırlanır; yeni GitHub yayını bu aşamanın parçası değildir. |

Stryker'ın Vitest adaptörü tarayıcı modunu desteklemiyor. İlk sürüm bu nedenle iş mantığı/birim testlerine ve çevrimdışı yerel verilere odaklanır. Statik bağımlılık seçimi bütün entegrasyon testlerini bulmuş gibi sunulmayacak. [Stryker](https://stryker-mutator.io/docs/stryker-js/vitest-runner/), [Vitest](https://vitest.dev/guide/cli.html).

## Ekleyebileceğimiz özellikler

Aşağıdaki fayda ve maliyetler tasarım tahminidir. “İlk kullanılabilir sürüm” yerel teslimdir; ekip alanı, tam ürünün ayrı sonraki teslimidir.

| Özellik | Somut fayda | Öncelik | Maliyet / bakım |
| --- | --- | --- | --- |
| Eski/yeni kodda aynı regresyon testini sınama | Yazılan testin ilgili davranışı gerçekten ayırt ettiğini görme. | İlk yerel sürüm | Yüksek / orta |
| Kontrollü hata denemeleri | Yeşil görünen testlerin değişen kodda kaçırdığı durumları görme. | İlk yerel sürüm | Yüksek / orta-yüksek |
| Test zayıflatma uyarıları | Silinen zorunlu test, `skip/only`, değişen eşik/istisna ve snapshot güncellemelerini görünür kılma. Otomatik kötü niyet hükmü vermez. | İlk yerel sürüm | Orta / orta |
| Güncellik kontrolü ve kanıt paketi | Farklı koda ait eski başarılı raporun kullanılmasını önleme; JSON/HTML ile inceleme. | İlk yerel sürüm | Orta / düşük-orta |
| Süre/CPU/bellek sınırları ve iptal | Doğrulamanın kullanıcının makinesini sınırsız tüketmesini önleme. | İlk yerel sürüm | Orta-yüksek / orta |
| Değişken test sonucu tespiti | Üç taze denemede gözlenen tutarsızlığı açıkça bildirme. Hiçbir zaman tekrar geçişiyle ilk hatayı gizlemez. | İlk yerel sürüm | Orta / orta |
| Claude/Codex araçları ve sonuç ekranı | Ajanın raporu okuyup eksik testi iyileştirdiği kısa geliştirme döngüsü. | İlk yerel sürüm | Orta / orta |
| GitHub CI kapısı | Birleştirme öncesinde aynı politika ve gerçek sonuçları kullanma. | Sonraki teslim | Orta / orta |
| Güvenli ekip çalışma alanları | Roller, davetler, proje sınırları, işlemlerin kaydı ve kayıtlı worker. | Sonraki teslim; tam ürün için gerekli | Yüksek / yüksek |
| Davranış maddesi → test → sonuç bağlantısı | Hangi talebin hangi testle sınandığını gösterme. Bağlantı insan tarafından onaylanır; sistem doğal dil talebinin eksiksizliğini varsaymaz. | Sonraki iyileştirme | Orta / orta |
| Tam girdi kimliğine bağlı sonuç önbelleği | Tekrar maliyetini azaltma. Kritik eski/yeni doğrulamalar yine taze çalışır. | Sonraki iyileştirme | Yüksek / orta |
| Playwright, API sözleşmeleri, DB geçişleri | UI ve servis davranışlarını kapsama; başka test türleri için ayrı adaptörler. | Çekirdek kullanıldıktan sonra | Çok yüksek / yüksek |
| Opsiyonel AI açıklaması ve test önerisi | Bulguları açıklayıp yeni test önermek. Önerilen testin sonucu ancak çalıştırılarak belirlenir. | Talep doğrulanırsa | Orta-yüksek / yüksek; ek API maliyeti olabilir |

En değerli ilk eklemeler test zayıflatma uyarıları, rapor güncelliği ve açık bütçedir. Daha çok araç/ajan koşturmak yerine bunların gerçek başarısını gösteren örnekler hazırlayacağız. ContextLedger ve MergeLab fikirleri bu projenin içine alınmıyor.

## Teknik olarak yanıltıcı sonuçları önleyen kurallar

- Eski sürümde rastgele çökme, eksik paket veya zaman aşımı, “hatayı yakaladı” sayılmaz. Beklenen test ve doğrulama hatası eşleşmelidir.
- Testleri eski koda taşırken uygulama kodu veya bağımlılıklar gizlice değiştirilmez. Yeni API gereksinimi nedeniyle karşılaştırma yapılamıyorsa sonuç belirsizdir.
- Kaynak, testler, bağımlılıklar, ortam ve politika sürümü rapora bağlanır. Sadece dosya adı veya eski yeşil durum yeterli değildir.
- Hiç test bulunmaması, eksik deneme, iptal ve bütçe aşımı ilgili zorunlu kontrol için başarı üretmez.
- Kontrollü bir hatanın testten kaçması incelenmesi gereken bulgudur; her kaçan mutasyon gerçek bir ürün hatası değildir.
- Proje testleri çalıştırılabilir koddur. Docker kısıtları uygulanır; ürün düşmanca kodu sınırsız kabul eden herkese açık bir çalıştırma servisi olarak sunulmaz.
- Test edilen projenin aday değişikliği zorunlu doğrulama politikasını kendisi gevşetemez. İstisnalar inceleyen kişiye ve kaynak/politika kimliğine bağlanır.

Bu kuralların ayrıntısı ve doğrulanacak olumsuz durumlar [teknik mimaride](ARCHITECTURE.md) tanımlıdır.

## Kullanıcı akışı ve arayüz

Yerelde ilk kullanım: ortam kontrolü → proje seçimi/kaydı → değişikliğin okunması → bütçesi görünen doğrulama planı → çalıştırma → kod farkı yanında sonuçlar. Çalıştırma mevcut dosyaları geri almaz veya otomatik commit oluşturmaz.

Ana ekran bir değişiklik incelemesidir. Üstte sınanan sürüm ve kapsam; yanında sonuç, süre ve açık bulgular bulunur. Altında eski/yeni test karşılaştırması, kontrollü hata sonuçları ve ayrıntı bağlantıları yer alır. Her durumda “geçti”, “başarısız” veya “belirsiz” sözcükleri kullanılır; yalnızca renge güvenilmez. Klavye kullanımı, görünür odak, küçük ekran ve TR/EN metinler kabul kontrolüne girer.

Yerel kullanımda hesap açılması gerekmez; tarayıcı erişimi kısa ömürlü başlatma bilgisiyle korunur. Ekip sürümünde HTTPS, güvenli oturum, davet ve owner/admin/member/viewer rolleri uygulanır. Viewer çalıştırma başlatamaz. Proje, rapor ve dosya erişimleri backend'de doğrulanır. Parola kurtarma ilk ekip sürümünde operatörün ürettiği süreli tek kullanımlık bağlantıyla sağlanır; SMTP/MFA/SSO sonraki kapsamdır.

## Teslim sırası ve bitiş ölçütleri

| Aşama | Çıktı | Tamamlanma ölçütü |
| --- | --- | --- |
| 1. Gerçek doğrulama çekirdeği | Değişmez görüntü, sınırlı runner, Vitest/Stryker adaptörü, JSON kanıtı. | İyi düzeltme, zayıf test, beklenmeyen hata, kararsız test, kaynak değişimi ve bütçe aşımı örnekleri doğru ayrılır; gerçek container denemeleri geçer. |
| 2. İlk kullanılabilir yerel sürüm | CLI + Claude/Codex MCP + inceleme arayüzü + HTML raporu + ortam kontrolü + TR/EN kurulum. | Temiz kurulumda örnek proje uçtan uca çalışır; yerel HTTP/MCP sınırları ve Windows/Linux destek yolu doğrulanır. |
| 3. Ekip ve CI teslimi | Kendi sunucusunda ekip alanları, rol/davet/oturum yönetimi, worker kaydı ve GitHub kontrolü. | Ekipler arası erişim, yetkisiz çalıştırma, politika değiştirme ve iptal/yeniden başlatma olumsuz testleri geçer. CI yalnızca gerekli kontroller geçtiğinde başarı döndürür. |
| 4. Açık kaynak yayın sürümü | Güvenli örnek demo, anlamlı testler, kolay kurulum, bakım/güvenlik belgeleri ve TR/EN ürün dokümantasyonu. | Temiz kaynaktan kurulum ve demo doğrulanır; desteklenen sürümler ve gerçek ölçümler yayımlanır. Yayın kapsamı yalnızca ProofGate dosyalarıdır. |

Her aşama kullanılabilir bir çıktıyla kapanır. Yerel araç, ekip ve CI ayrı kontrollerle doğrulanır; birinin bitmesi diğerinin geçtiği anlamına gelmez. Gerçek kontrol kayıtları ve yayın durumu [STATUS](STATUS.md) dosyasında tutulur.

## İlk sürüme alınmayanlar

Genel amaçlı ajan orkestrasyonu, otomatik kod birleştirme/yayınlama, ödeme sistemi, açık kayıt, zorunlu model aboneliği, bulutta keyfi kod çalıştırma ve çok sayıda programlama dili kapsam dışıdır. Bu özellikler çekirdeğin başarısını göstermek için gerekli değildir.

## Araştırmanın karara etkisi

- Mutasyon motoru mevcut: yeniden geliştirmek yerine Stryker'ın üzerine kaynak/kanıt ve politika katmanı kuruyoruz. [Stryker Vitest adaptörü](https://stryker-mutator.io/docs/stryker-js/vitest-runner/).
- Önbellekte ortam değişiklikleri önemlidir: Stryker'ın artımlı modu tek başına tüm ortamı izlemez. İlk sürüm kararları önbellekten alınmaz. [Stryker artımlı mod](https://stryker-mutator.io/docs/stryker-js/incremental/).
- Ortak bağlantı MCP'dir; iki ürünün paketleri ayrı hazırlanır. Hook içeren Codex paketlerinin herkese açık dizin dağıtımında kısıtları var; manuel GitHub kurulumu ile mağaza kabulü aynı şey değildir. [OpenAI Docs](https://developers.openai.com/plugins/build/plugins), [Claude Code](https://code.claude.com/docs/en/plugins).

Kararlar 25 Ekim 2026'da incelenen birincil belgelere dayanır. Uygulama ve ölçülen doğrulama durumu [STATUS](STATUS.md) dosyasındadır; saha kullanımı veya bağımsız denetim iddia edilmez. Teknik kaynaklar [mimari belgesinde](ARCHITECTURE.md#9-primary-sources-consulted) yer alır.
