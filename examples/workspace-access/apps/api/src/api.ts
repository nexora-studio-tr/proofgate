import {canEdit} from '@fixture/access';
export const request=(role:string)=>canEdit(role);
