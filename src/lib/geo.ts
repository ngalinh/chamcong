// Haversine distance giữa 2 toạ độ (mét)
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type Coords = { latitude: number; longitude: number; accuracy?: number };

/**
 * Detect iOS Safari, Android Chrome để hiển thị hướng dẫn đúng.
 */
function platformLabel(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function deniedHelpMessage(): string {
  const p = platformLabel();
  if (p === "ios") {
    return "Quyền vị trí bị chặn. Vào Settings → Safari → Location → chọn Allow cho chamcong.basso.vn, sau đó reload trang. (Hoặc Settings → Privacy → Location Services → Safari Websites)";
  }
  if (p === "android") {
    return "Quyền vị trí bị chặn. Bấm vào icon ổ khoá ở thanh địa chỉ → Permissions → bật Location, sau đó reload trang.";
  }
  return "Quyền vị trí bị chặn. Vào cài đặt trình duyệt → bật Location cho trang này, rồi reload.";
}

export async function getCurrentCoords(): Promise<Coords> {
  if (!("geolocation" in navigator)) {
    throw new Error("Thiết bị không hỗ trợ định vị");
  }

  // Pre-check permission state nếu browser hỗ trợ Permissions API
  // → bắt được trường hợp 'denied' mà không cần đợi getCurrentPosition fail
  if ("permissions" in navigator) {
    try {
      const perm = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (perm.state === "denied") throw new Error(deniedHelpMessage());
    } catch (e) {
      // Re-throw nếu là lỗi denied của mình
      if (e instanceof Error && e.message.includes("Quyền vị trí")) throw e;
      // Permissions API có thể fail trên 1 số browser cũ — bỏ qua, fallback xuống getCurrentPosition
    }
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        // Map error code sang message tiếng Việt rõ ràng
        if (err.code === 1) reject(new Error(deniedHelpMessage()));         // PERMISSION_DENIED
        else if (err.code === 2) reject(new Error("Không xác định được vị trí. Kiểm tra GPS / WiFi."));  // POSITION_UNAVAILABLE
        else if (err.code === 3) reject(new Error("Định vị quá lâu. Thử lại nơi có GPS rõ hơn."));  // TIMEOUT
        else reject(new Error(err.message || "Lỗi định vị"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
