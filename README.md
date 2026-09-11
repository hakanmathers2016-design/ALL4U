# ALL4U PWA

Bu paket, App Store'a yüklemeden Safari üzerinden kullanılabilen installable PWA prototipidir.

## İçinde olanlar
- Koyu mor + mavi ALL4U tasarımı
- Partner durumu ana ekran odağı
- Durum değiştirme
- Kalp / öpücük / sarıl animasyonları
- Bildirim izni ve cihaz içi test bildirimi
- Ana ekrana eklenebilir PWA manifesti
- Offline cache için service worker
- Birlikte olunan süre/gün sayacı YOK

## Çalıştırma
PWA özellikleri için dosyayı doğrudan açmak yerine HTTPS veya localhost üzerinden servis edin.

Kolay yerel test:
1. Klasörde terminal açın.
2. `python -m http.server 8080`
3. Bilgisayarda `http://localhost:8080` açın.

iPhone'da kullanmak için bu dosyaları ücretsiz bir HTTPS hostinge (ör. GitHub Pages) koyun.
Safari'de açın -> Paylaş -> Ana Ekrana Ekle.

## Push hakkında
Bu sürüm gerçek iki telefon arası push için hazır service worker altyapısına sahiptir,
ama karşı telefona internet üzerinden push göndermek için bir push/backend bağlantısı gerekir.
Sonraki adımda ücretsiz bir backend/push servisi bağlanabilir.

## Not
iPhone'da web push için PWA'nın Ana Ekrana eklenmesi ve kullanıcının bildirim izni vermesi gerekir.


## Realtime sürümü kurulumu
1. Supabase SQL Editor'da `ALL4U_JOIN_SETUP.sql` içeriğini bir kez çalıştırın.
2. Bu klasörü HTTPS üzerinden yayınlayın.
3. Her iki iPhone'da Safari ile açıp Ana Ekrana Ekle yapın.
4. İlk cihaz `Çift oluştur`, ikinci cihaz verilen `4U-XXXX` koduyla `Koda katıl` kullanır.
5. Durumlar ve kalp/öpücük/sarıl etkileşimleri Supabase Realtime üzerinden senkronize olur.

Not: Bu sürüm uygulama açıkken/aktifken Realtime etkileşimleri gösterir. Uygulama tamamen kapalıyken gerçek Web Push için push aboneliklerini saklayan ve VAPID ile bildirim gönderen güvenli sunucu fonksiyonu ayrıca gerekir.
