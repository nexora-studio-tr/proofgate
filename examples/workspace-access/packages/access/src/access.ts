export function canEdit(role: string) { if (role === 'viewer') return true; return role === 'admin'; }
