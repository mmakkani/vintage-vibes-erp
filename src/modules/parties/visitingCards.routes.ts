import { Router } from 'express';
import { Client } from 'pg';
import { supabase } from '../../supabaseClient.ts';

export const visitingCardsRouter = Router();

const getDbClient = async () => {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  try {
    const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
    if (match) {
      let [_, user, rawPwd, host, port, rest] = match;
      if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
      dbUrl = `postgresql://${user}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
    }
  } catch (e) {}

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
};

const mapCardRow = (row: any) => ({
  id: String(row.id),
  companyName: row.company_name || '',
  company_name: row.company_name || '',
  contactPerson: row.contact_person || '',
  contact_person: row.contact_person || '',
  designation: row.designation || '',
  phone: row.phone || '',
  email: row.email || '',
  address: row.address || '',
  website: row.website || '',
  cardImageUrl: row.card_image_url || '',
  card_image_url: row.card_image_url || '',
  notes: row.notes || '',
  status: row.status || 'LEAD',
  convertedPartyId: row.converted_party_id ? String(row.converted_party_id) : null,
  converted_party_id: row.converted_party_id ? String(row.converted_party_id) : null,
  createdAt: row.created_at,
  created_at: row.created_at,
  updatedAt: row.updated_at,
  updated_at: row.updated_at
});

// GET /api/visiting-cards - List all visiting cards
visitingCardsRouter.get('/', async (req, res) => {
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query('SELECT * FROM public.visiting_cards ORDER BY created_at DESC;');
    return res.json((result.rows || []).map(mapCardRow));
  } catch (err: any) {
    console.warn('[visitingCardsRouter GET /] PG Error, trying Supabase fallback:', err.message);
    try {
      const { data, error } = await supabase
        .from('visiting_cards')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json((data || []).map(mapCardRow));
    } catch (fallbackErr: any) {
      console.error('[visitingCardsRouter GET /] Fallback failed:', fallbackErr.message);
      return res.status(500).json({ error: 'Failed to fetch visiting cards', details: fallbackErr.message });
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// GET /api/visiting-cards/:id - Get single card
visitingCardsRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query('SELECT * FROM public.visiting_cards WHERE id = $1 LIMIT 1;', [id]);
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Visiting card not found' });
    }
    return res.json(mapCardRow(result.rows[0]));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch visiting card', details: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// POST /api/visiting-cards - Save new card
visitingCardsRouter.post('/', async (req, res) => {
  const {
    companyName,
    company_name,
    contactPerson,
    contact_person,
    designation,
    phone,
    email,
    address,
    website,
    cardImageUrl,
    card_image_url,
    notes,
    status
  } = req.body;

  const finalCompany = (companyName || company_name || '').trim();
  const finalContact = (contactPerson || contact_person || '').trim();
  const finalDesignation = (designation || '').trim();
  const finalPhone = (phone || '').trim();
  const finalEmail = (email || '').trim();
  const finalAddress = (address || '').trim();
  const finalWebsite = (website || '').trim();
  const finalCardImage = (cardImageUrl || card_image_url || '').trim();
  const finalNotes = (notes || '').trim();
  const finalStatus = status || 'LEAD';

  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query(
      `INSERT INTO public.visiting_cards (
        company_name, contact_person, designation, phone, email, address, website, card_image_url, notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *;`,
      [
        finalCompany,
        finalContact,
        finalDesignation,
        finalPhone,
        finalEmail,
        finalAddress,
        finalWebsite,
        finalCardImage,
        finalNotes,
        finalStatus
      ]
    );

    return res.status(201).json(mapCardRow(result.rows[0]));
  } catch (err: any) {
    console.warn('[visitingCardsRouter POST /] PG Error, trying Supabase fallback:', err.message);
    try {
      const { data, error } = await supabase
        .from('visiting_cards')
        .insert([{
          company_name: finalCompany,
          contact_person: finalContact,
          designation: finalDesignation,
          phone: finalPhone,
          email: finalEmail,
          address: finalAddress,
          website: finalWebsite,
          card_image_url: finalCardImage,
          notes: finalNotes,
          status: finalStatus
        }])
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(mapCardRow(data));
    } catch (fallbackErr: any) {
      console.error('[visitingCardsRouter POST /] Fallback failed:', fallbackErr.message);
      return res.status(500).json({ error: 'Failed to create visiting card', details: fallbackErr.message });
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// PUT /api/visiting-cards/:id - Update card
visitingCardsRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    companyName,
    company_name,
    contactPerson,
    contact_person,
    designation,
    phone,
    email,
    address,
    website,
    cardImageUrl,
    card_image_url,
    notes,
    status,
    convertedPartyId,
    converted_party_id
  } = req.body;

  const finalCompany = (companyName || company_name || '').trim();
  const finalContact = (contactPerson || contact_person || '').trim();
  const finalDesignation = (designation || '').trim();
  const finalPhone = (phone || '').trim();
  const finalEmail = (email || '').trim();
  const finalAddress = (address || '').trim();
  const finalWebsite = (website || '').trim();
  const finalCardImage = (cardImageUrl || card_image_url || '').trim();
  const finalNotes = (notes || '').trim();
  const finalPartyId = convertedPartyId || converted_party_id || null;

  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query(
      `UPDATE public.visiting_cards SET
        company_name = COALESCE(NULLIF($1, ''), company_name),
        contact_person = COALESCE(NULLIF($2, ''), contact_person),
        designation = COALESCE(NULLIF($3, ''), designation),
        phone = COALESCE(NULLIF($4, ''), phone),
        email = COALESCE(NULLIF($5, ''), email),
        address = COALESCE(NULLIF($6, ''), address),
        website = COALESCE(NULLIF($7, ''), website),
        card_image_url = COALESCE(NULLIF($8, ''), card_image_url),
        notes = $9,
        status = COALESCE($10, status),
        converted_party_id = COALESCE($11, converted_party_id),
        updated_at = NOW()
      WHERE id = $12
      RETURNING *;`,
      [
        finalCompany,
        finalContact,
        finalDesignation,
        finalPhone,
        finalEmail,
        finalAddress,
        finalWebsite,
        finalCardImage,
        finalNotes,
        status || null,
        finalPartyId,
        id
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Visiting card not found' });
    }

    return res.json(mapCardRow(result.rows[0]));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update visiting card', details: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// POST /api/visiting-cards/:id/convert - Mark as converted to party
visitingCardsRouter.post('/:id/convert', async (req, res) => {
  const { id } = req.params;
  const { partyId, party_id } = req.body;
  const finalPartyId = partyId || party_id;

  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query(
      `UPDATE public.visiting_cards SET
        status = 'CONVERTED',
        converted_party_id = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *;`,
      [finalPartyId, id]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Visiting card not found' });
    }

    return res.json(mapCardRow(result.rows[0]));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to mark card as converted', details: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// DELETE /api/visiting-cards/:id - Delete card
visitingCardsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query('DELETE FROM public.visiting_cards WHERE id = $1 RETURNING id;', [id]);
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Visiting card not found' });
    }
    return res.json({ success: true, message: 'Visiting card deleted', id });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete visiting card', details: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});
