import {request} from '@fixture/api';
export const mayRecord=(role:string,locked=false)=>request(role,locked);
