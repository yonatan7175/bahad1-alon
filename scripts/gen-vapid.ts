// Prints a new VAPID key pair for Web Push. Put them in the environment:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY (public), VAPID_PRIVATE_KEY (SECRET), VAPID_SUBJECT=mailto:you@example.com
// Changing keys later invalidates every device subscription (users re-enable notifications).
import webpush from "web-push";

const k = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
