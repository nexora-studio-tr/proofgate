import {canEdit} from '@fixture/access';
export const request=(role:string,locked=false)=>canEdit(role,locked);
