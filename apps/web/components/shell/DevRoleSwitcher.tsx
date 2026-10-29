"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useRole } from "../providers/RoleProvider";
import { ROLE_LABELS } from "@/lib/navigation";
import { isRole } from "@/lib/mocks/role";
import type { Role } from "@/lib/api/types";

const ROLES: readonly Role[] = [
  "importer_exporter",
  "port_operator",
  "platform_admin",
];

export function DevRoleSwitcher() {
  const { role, setRole, canSwitchRole } = useRole();
  const queryClient = useQueryClient();

  if (!canSwitchRole) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="role-switcher"
        >
          <span className="hidden sm:inline">{ROLE_LABELS[role]}</span>
          <span className="sm:hidden">Role</span>
          <span className="sr-only">Switch demo role</span>
          <ChevronDown aria-hidden="true" className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Demo role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={role}
          onValueChange={(value) => {
            if (isRole(value)) {
              setRole(value);
              void queryClient.invalidateQueries({ queryKey: ["me"] });
            }
          }}
        >
          {ROLES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {ROLE_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
