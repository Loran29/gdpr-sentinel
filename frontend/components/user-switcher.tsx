"use client";

import { use_app_state } from "@/context/app-state";
import { Select, SelectItem } from "@/components/ui/select";

export function UserSwitcher() {
  const { users, selected_user_id, sign_in } = use_app_state();

  return (
    <div className="w-60">
      <Select value={selected_user_id ?? ""} onChange={(event) => sign_in(event.target.value)}>
        {users.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            {user.name} ({user.role})
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}
