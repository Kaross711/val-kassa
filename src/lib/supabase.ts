// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Verwijdert één rij op id en controleert of er ook echt iets weg is.
 *
 * Supabase geeft bij een delete die door RLS wordt tegengehouden gewoon een
 * geslaagde respons zonder foutmelding terug. Zonder deze controle lijkt de
 * verwijderknop dan te werken (de lijst wordt herladen) terwijl de rij blijft
 * staan. Door de verwijderde rijen op te vragen weten we het zeker.
 */
export async function deleteRowById(table: string, id: string, omschrijving: string): Promise<void> {
    const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error(
            `${omschrijving} is niet verwijderd: de database gaf geen toestemming. Ververs de pagina en probeer het opnieuw.`
        );
    }
}

/**
 * Past één rij aan op id en controleert net als hierboven of de wijziging ook
 * echt is doorgevoerd, in plaats van stilzwijgend te verdampen.
 */
export async function updateRowById(
    table: string,
    id: string,
    waarden: Record<string, unknown>,
    omschrijving: string
): Promise<void> {
    const { data, error } = await supabase.from(table).update(waarden).eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error(
            `${omschrijving} is niet aangepast: de database gaf geen toestemming. Ververs de pagina en probeer het opnieuw.`
        );
    }
}
