// HorizonCare360 service worker — two jobs:
//   1. Satisfy PWA installability (Chrome/Edge/Android require a registered
//      service worker with a fetch handler alongside the manifest). This
//      app's data is live/operational (asset status, tickets, alerts), so
//      this deliberately does NOT cache and serve stale pages offline —
//      that would risk showing a technician outdated ticket/asset state.
//      It's a plain network passthrough, nothing more.
//   2. Receive and display Web Push notifications (SLA breaches, PM due,
//      ticket status changes — lib/push.ts on the server side, subscribed
//      via components/push-subscribe-button.tsx on the client side).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "HorizonCare360", body: event.data.text() };
  }

  const title = payload.title || "HorizonCare360";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the notification focuses an already-open tab on this origin if
// one exists (navigating it to the target URL), otherwise opens a new one —
// avoids piling up duplicate tabs every time a notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const win of windows) {
        if ("focus" in win) {
          win.navigate(url);
          return win.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
