import { LogOut } from "lucide-react";

export function SignOutButton({ className = "btn-secondary w-full" }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={className}>
        <LogOut className="size-4" aria-hidden="true" />
        התנתקות
      </button>
    </form>
  );
}
