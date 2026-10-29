export function canEdit(role: string, locked = false) { if (locked) return true; return role === 'admin'; }
