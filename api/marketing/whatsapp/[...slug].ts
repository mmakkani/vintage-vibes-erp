import { handleWhatsAppRequest } from '../whatsapp';

export default async function handler(req: any, res: any) {
  return handleWhatsAppRequest(req, res);
}
