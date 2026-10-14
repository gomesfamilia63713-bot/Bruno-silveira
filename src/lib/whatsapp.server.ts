/**
 * Disparo de notificações WhatsApp para administradores (números individuais
 * e grupos). Suporta dois provedores, escolhidos pelas variáveis presentes:
 *
 * 1) Evolution API / Z-API compatível (SUPORTA GRUPOS):
 *    WHATSAPP_API_URL      ex.: https://minha-evolution.com
 *    WHATSAPP_API_KEY      apikey da instância
 *    WHATSAPP_INSTANCE     nome da instância
 *
 * 2) Meta WhatsApp Cloud API (somente números individuais):
 *    WHATSAPP_PHONE_NUMBER_ID
 *    WHATSAPP_TOKEN
 *
 * Destinatários (obrigatório): WHATSAPP_ADMIN_RECIPIENTS
 *    lista separada por vírgula. Ex.: "5511999999999,120363000000000000@g.us"
 *    Itens terminados em "@g.us" são grupos de administradores.
 *
 * Sem configuração o envio vira no-op silencioso (o app continua funcionando).
 */

async function recipients(): Promise<string[]> {
  const list: string[] = [];
  // 1) Números/grupos cadastrados no app (aba Pedidos → Notificações WhatsApp)
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await (supabaseAdmin as never as {
      from: (t: string) => {
        select: (c: string) => { eq: (k: string, v: boolean) => Promise<{ data: { target: string }[] | null }> };
      };
    })
      .from('whatsapp_recipients')
      .select('target')
      .eq('active', true);
    for (const r of data ?? []) if (r.target) list.push(r.target.trim());
  } catch (e) {
    console.error('[whatsapp] falha ao ler destinatários', e);
  }
  // 2) Fallback opcional por variável de ambiente
  const raw = process.env['WHATSAPP_ADMIN_RECIPIENTS'] ?? '';
  for (const s of raw.split(',')) if (s.trim()) list.push(s.trim());
  return Array.from(new Set(list));
}


async function sendViaEvolution(to: string, text: string) {
  const base = process.env['WHATSAPP_API_URL']!.replace(/\/+$/, '');
  const instance = process.env['WHATSAPP_INSTANCE'] ?? 'default';
  const res = await fetch(`${base}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env['WHATSAPP_API_KEY'] ?? '' },
    body: JSON.stringify({ number: to, text, textMessage: { text } }),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${await res.text()}`);
}

async function sendViaCloudApi(to: string, text: string) {
  const id = process.env['WHATSAPP_PHONE_NUMBER_ID']!;
  const res = await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env['WHATSAPP_TOKEN']}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) throw new Error(`CloudAPI ${res.status}: ${await res.text()}`);
}

/** Envia a mensagem para todos os admins/grupos configurados. Nunca lança. */
export async function notifyAdminsWhatsApp(text: string): Promise<{ sent: number; skipped?: string }> {
  const list = await recipients();
  if (list.length === 0) return { sent: 0, skipped: 'sem destinatários configurados' };

  const hasEvolution = !!process.env['WHATSAPP_API_URL'] && !!process.env['WHATSAPP_API_KEY'];
  const hasCloud = !!process.env['WHATSAPP_PHONE_NUMBER_ID'] && !!process.env['WHATSAPP_TOKEN'];
  if (!hasEvolution && !hasCloud) return { sent: 0, skipped: 'provedor não configurado' };

  let sent = 0;
  await Promise.all(
    list.map(async (to) => {
      try {
        const isGroup = to.endsWith('@g.us');
        if (hasEvolution) await sendViaEvolution(to, text);
        else if (isGroup) return; // Cloud API não envia para grupos
        else await sendViaCloudApi(to, text);
        sent += 1;
      } catch (err) {
        console.error('[whatsapp] falha ao enviar para', to, err);
      }
    }),
  );
  return { sent };
}
