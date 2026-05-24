const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');

/**
 * Generates a premium referral code for a lead.
 */
function generateReferralCode(clinicId, leadId) {
  return `FB-${leadId}-GOLD`;
}

/**
 * Parses referrer lead ID from a referral code.
 */
function parseReferrerFromCode(referralCode) {
  if (!referralCode) return null;
  const match = referralCode.match(/^FB-(\d+)-GOLD$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Connects a referee (referred lead) to their referrer using a referral code.
 */
async function trackReferral(clinicId, referralCode, referredLeadId) {
  const pool = getPool();
  const referrerId = parseReferrerFromCode(referralCode);

  if (!referrerId) {
    throw new AppError(400, 'INVALID_REFERRAL_CODE', 'The referral code is invalid or malformed.');
  }

  if (referrerId === Number(referredLeadId)) {
    throw new AppError(400, 'SELF_REFERRAL_FORBIDDEN', 'Leads cannot refer themselves.');
  }

  // Verify referrer exists
  const referrerResult = await pool.query(
    'select id from leads where clinic_id = $1 and id = $2',
    [clinicId, referrerId]
  );
  if (referrerResult.rowCount === 0) {
    throw new AppError(404, 'REFERRER_NOT_FOUND', 'Referrer lead was not found.');
  }

  // Create relationship
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query(
      `insert into beauty_referrals (clinic_id, referrer_lead_id, referred_lead_id, referral_code, status)
       values ($1, $2, $3, $4, 'pending')
       on conflict (referred_lead_id) do nothing
       returning *`,
      [clinicId, referrerId, referredLeadId, referralCode]
    );
    await client.query('commit');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records a clinic purchase, awards points, and processes MGM bonuses.
 */
async function recordPurchaseAndAwardPoints(clinicId, leadId, amount, description = 'หัตถการความงาม') {
  const pool = getPool();
  const pointsToEarn = Math.floor(amount / 100); // 1 point per 100 THB spent

  if (pointsToEarn <= 0) {
    return { pointsEarned: 0, referralProcessed: false };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    // 1. Insert Earned Points into Ledger
    await client.query(
      `insert into loyalty_points_ledger (clinic_id, lead_id, points, transaction_type, description)
       values ($1, $2, $3, 'earn', $4)`,
      [clinicId, leadId, pointsToEarn, `${description} (ยอดชำระ ${amount} บาท)`]
    );

    // 2. Check for Pending Referral
    const referralResult = await client.query(
      `select * from beauty_referrals 
       where clinic_id = $1 and referred_lead_id = $2 and status = 'pending'`,
      [clinicId, leadId]
    );

    let referralProcessed = false;
    let referrerBonus = 0;
    let refereeBonus = 0;

    if (referralResult.rowCount > 0) {
      const referral = referralResult.rows[0];
      referrerBonus = 100; // Referrer gets 100 points
      refereeBonus = 50;   // Referee gets 50 points

      // Update Referral status to converted
      await client.query(
        `update beauty_referrals 
         set status = 'converted', reward_issued = true, updated_at = now()
         where id = $1`,
        [referral.id]
      );

      // Award Referrer Bonus
      await client.query(
        `insert into loyalty_points_ledger (clinic_id, lead_id, points, transaction_type, description)
         values ($1, $2, $3, 'referral_bonus', $4)`,
        [clinicId, referral.referrer_lead_id, referrerBonus, `โบนัสแนะนำเพื่อนยอดเข้าใช้บริการครั้งแรก`]
      );

      // Award Referee Bonus
      await client.query(
        `insert into loyalty_points_ledger (clinic_id, lead_id, points, transaction_type, description)
         values ($1, $2, $3, 'referral_bonus', $4)`,
        [clinicId, leadId, refereeBonus, `โบนัสต้อนรับคนไข้ใหม่จากการแนะนำเพื่อน`]
      );

      referralProcessed = true;
    }

    await client.query('commit');

    return {
      success: true,
      pointsEarned: pointsToEarn,
      referralProcessed,
      referrerBonus,
      refereeBonus
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieves the total loyalty points balance for a lead.
 */
async function getLoyaltyBalance(clinicId, leadId) {
  const pool = getPool();
  const result = await pool.query(
    'select coalesce(sum(points), 0) as balance from loyalty_points_ledger where clinic_id = $1 and lead_id = $2',
    [clinicId, leadId]
  );
  return Number.parseInt(result.rows[0].balance, 10);
}

/**
 * Retrieves the list of referred friends (MGM list) for a referrer.
 */
async function getReferralsList(clinicId, leadId) {
  const pool = getPool();
  const result = await pool.query(
    `select r.*, l.full_name as referred_lead_name, l.status as lead_status, l.stage as lead_stage
     from beauty_referrals r
     inner join leads l on l.id = r.referred_lead_id
     where r.clinic_id = $1 and r.referrer_lead_id = $2
     order by r.created_at desc`,
    [clinicId, leadId]
  );
  return result.rows;
}

module.exports = {
  generateReferralCode,
  parseReferrerFromCode,
  trackReferral,
  recordPurchaseAndAwardPoints,
  getLoyaltyBalance,
  getReferralsList
};
