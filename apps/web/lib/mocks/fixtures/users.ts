import type { Me, Role } from "../../api/types";

export const mockUsers = {
  importer: {
    user_id: "user_imp_001",
    email: "importer@portiq.demo",
    display_name: "Demo Importer",
    role: "importer_exporter",
    assigned_port_ids: [],
  },
  operator: {
    user_id: "user_op_001",
    email: "operator@portiq.demo",
    display_name: "Demo Operator",
    role: "port_operator",
    assigned_port_ids: ["port_nsa", "port_sin"],
  },
  admin: {
    user_id: "user_admin_001",
    email: "admin@portiq.demo",
    display_name: "Demo Admin",
    role: "platform_admin",
    assigned_port_ids: [],
  },
} satisfies Record<string, Me>;

export const mockUsersByRole: Record<Role, Me> = {
  importer_exporter: mockUsers.importer,
  port_operator: mockUsers.operator,
  platform_admin: mockUsers.admin,
};
