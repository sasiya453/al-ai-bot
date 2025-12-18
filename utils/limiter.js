// utils/limiter.js
import { supabaseAdmin } from '../lib/supabase.js';

const DAILY_FREE_LIMIT = parseInt(process.env.DAILY_FREE_LIMIT || '5', 10);

/**
 * Get or create a user row by telegram_id
 */
async function getOrCreateUser(telegramId, username = '') {
  const today = new Date().toISOString().slice(0, 10);

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Supabase get user error', error);
    throw error;
  }

  if (!user) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        telegram_id: telegramId,
        username,
        daily_count: 0,
        last_reset: today,
        language: 'en'
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    return inserted;
  }

  // Ensure last_reset exists
  if (!user.last_reset) {
    user.last_reset = today;
    user.daily_count = 0;
    await supabaseAdmin
      .from('users')
      .update({ last_reset: today, daily_count: 0 })
      .eq('id', user.id);
  }

  return user;
}

/**
 * Check & increment daily limit.
 * Returns { allowed, remaining }
 */
export async function checkAndIncrementLimit(telegramId, username = '') {
  const today = new Date().toISOString().slice(0, 10);

  let user = await getOrCreateUser(telegramId, username);

  let dailyCount = user.daily_count || 0;
  let lastReset = user.last_reset;

  if (lastReset !== today) {
    dailyCount = 0;
    lastReset = today;
  }

  if (dailyCount >= DAILY_FREE_LIMIT) {
    // Update reset date if needed
    if (user.last_reset !== lastReset) {
      await supabaseAdmin
        .from('users')
        .update({ last_reset: lastReset })
        .eq('id', user.id);
    }

    return {
      allowed: false,
      remaining: 0
    };
  }

  dailyCount += 1;

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      daily_count: dailyCount,
      last_reset: lastReset,
      username
    })
    .eq('id', user.id);

  if (error) throw error;

  return {
    allowed: true,
    remaining: DAILY_FREE_LIMIT - dailyCount
  };
}

/**
 * Get language preference for user
 */
export async function getUserLanguage(telegramId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('language')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.language || 'en';
}

/**
 * Set language preference ('en' or 'si')
 */
export async function setUserLanguage(telegramId, language) {
  const lang = language === 'si' ? 'si' : 'en';
  const { error } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        telegram_id: telegramId,
        language: lang
      },
      { onConflict: 'telegram_id' }
    );

  if (error) throw error;
}
