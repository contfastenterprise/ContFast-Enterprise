/**
 * Google Contacts Integration Service
 * Uses Google People API to synchronize customer registers and updates to contfastenterprise@gmail.com.
 */

interface GoogleContactPayload {
  etag?: string;
  names: Array<{ givenName: string }>;
  emailAddresses?: Array<{ value: string; type: string }>;
  phoneNumbers?: Array<{ value: string; type: string }>;
  addresses?: Array<{ streetAddress: string; type: string }>;
}

/**
 * Gets a fresh access token from Google using OAuth2 credentials.
 */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[GoogleContacts] Credentials missing (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN). Skipping sync.');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GoogleContacts] Token exchange failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  } catch (error: any) {
    console.error('[GoogleContacts] Error refreshing access token:', error.message);
    return null;
  }
}

/**
 * Searches Google Contacts for a contact matching the given email.
 * Returns the resourceName and etag if found.
 */
async function findContactByEmail(accessToken: string, email: string): Promise<{ resourceName: string; etag: string } | null> {
  try {
    const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(email)}&readMask=names,emailAddresses`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.warn(`[GoogleContacts] Search request failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { results?: Array<{ person: { resourceName: string; etag: string; emailAddresses?: Array<{ value: string }> } }> };
    if (data.results && data.results.length > 0) {
      // Find exact email match to avoid partial matches
      const match = data.results.find(r => 
        r.person.emailAddresses?.some(e => e.value.toLowerCase() === email.toLowerCase())
      );
      if (match) {
        return {
          resourceName: match.person.resourceName,
          etag: match.person.etag,
        };
      }
    }
    return null;
  } catch (error: any) {
    console.error('[GoogleContacts] Search error:', error.message);
    return null;
  }
}

/**
 * Synchronizes a customer to Google Contacts (create if not exists, update if exists).
 */
export async function syncCustomerToGoogleContacts(customer: {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}): Promise<void> {
  const email = customer.email?.trim();
  const name = customer.name.trim();

  // Run in a try-catch to ensure failure doesn't crash the main application thread
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    let existingContact: { resourceName: string; etag: string } | null = null;
    if (email) {
      existingContact = await findContactByEmail(accessToken, email);
    }

    // Build standard payload
    const payload: GoogleContactPayload = {
      names: [{ givenName: name }],
    };

    if (email) {
      payload.emailAddresses = [{ value: email, type: 'work' }];
    }
    if (customer.phone?.trim()) {
      payload.phoneNumbers = [{ value: customer.phone.trim(), type: 'work' }];
    }
    if (customer.address?.trim()) {
      payload.addresses = [{ streetAddress: customer.address.trim(), type: 'work' }];
    }

    if (existingContact) {
      console.log(`[GoogleContacts] Found existing contact for ${email} (${existingContact.resourceName}). Updating...`);
      payload.etag = existingContact.etag;

      const url = `https://people.googleapis.com/v1/${existingContact.resourceName}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers,addresses`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GoogleContacts] Update failed: ${response.status} - ${errorText}`);
      } else {
        console.log(`[GoogleContacts] Successfully updated contact: ${name}`);
      }
    } else {
      console.log(`[GoogleContacts] No contact found for ${email || name}. Creating new contact...`);
      
      const response = await fetch('https://people.googleapis.com/v1/people:createContact', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GoogleContacts] Creation failed: ${response.status} - ${errorText}`);
      } else {
        console.log(`[GoogleContacts] Successfully created contact: ${name}`);
      }
    }
  } catch (err: any) {
    console.error('[GoogleContacts] Synchronization process encountered a fatal error:', err.message);
  }
}
