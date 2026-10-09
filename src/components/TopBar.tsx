import { Link } from "@tanstack/react-router";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
import { Wordmark } from "@/components/brand/Lockup";

/**
 * The bar at the top of each tab: the small lockup on the left (no
 * endorsement at this size) and the student's initial, which opens Settings.
 */
export function TopBar({ initial, action }: { initial?: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between md:hidden">
      <Link to="/home" aria-label="Florence, Today" className="-ml-1 flex items-center gap-1.5 p-1">
        <FlorenceMark size={22} />
        <Wordmark className="text-[21px] text-foreground" />
      </Link>
      <div className="flex items-center gap-2">
        {action}
        <Link
          to="/profile"
          aria-label="Settings"
          className="grid size-11 place-items-center rounded-full"
        >
          <span className="grid size-9 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
            {initial ?? "·"}
          </span>
        </Link>
      </div>
    </div>
  );
}
