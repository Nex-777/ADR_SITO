import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        // Prelevare solo eventi in programmazione (da oggi in poi) e ordinati per data
        const today = new Date().toISOString();
        
        const { data, error } = await supabase
            .from('eventi')
            .select('*')
            .eq('tipo', 'evento')
            //.gte('data_evento', today) // da implementare in un secondo momento se le date sono uniformi
            .order('data_evento', { ascending: true })
            .limit(3);

        if (error) throw error;

        return res.status(200).json(data);
    } catch (err) {
        console.error('Error fetching events:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
