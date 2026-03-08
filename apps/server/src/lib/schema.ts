import { pgTable, pgEnum, text, integer, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

export const roleEnum = pgEnum('role', ['OWNER', 'EDITOR', 'VIEWER'])

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  name: text('name').notNull().default(''),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').default(false).notNull(),
  backupCodes: text('backup_codes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const vaults = pgTable('vaults', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const vaultMembers = pgTable('vault_members', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  role: roleEnum('role').notNull().default('VIEWER'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vaultId: text('vault_id').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
}, (t) => [uniqueIndex('vault_members_user_vault_idx').on(t.userId, t.vaultId)])

export const vaultFiles = pgTable('vault_files', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  vaultId: text('vault_id').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  hash: text('hash').notNull(),
  size: integer('size').notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('vault_files_vault_path_idx').on(t.vaultId, t.path),
  index('vault_files_vault_id_idx').on(t.vaultId),
])

// Relations (required for db.query.* with `with:`)
export const usersRelations = relations(users, ({ many }) => ({
  vaultMemberships: many(vaultMembers),
}))

export const vaultsRelations = relations(vaults, ({ many }) => ({
  members: many(vaultMembers),
  files: many(vaultFiles),
}))

export const vaultMembersRelations = relations(vaultMembers, ({ one }) => ({
  user: one(users, { fields: [vaultMembers.userId], references: [users.id] }),
  vault: one(vaults, { fields: [vaultMembers.vaultId], references: [vaults.id] }),
}))

export const vaultFilesRelations = relations(vaultFiles, ({ one }) => ({
  vault: one(vaults, { fields: [vaultFiles.vaultId], references: [vaults.id] }),
}))
