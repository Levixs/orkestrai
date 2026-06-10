import { ScheduledTask } from '@beeblock/svelar/scheduler';
import { QueryBuilder } from '@beeblock/svelar/orm';

export default class CleanupExpiredTokens extends ScheduledTask {
  name = 'cleanup-expired-tokens';

  schedule() {
    return this.daily();
  }

  async handle(): Promise<void> {
    const now = new Date().toISOString();
    const result = {
      passwordResets: 0,
      verifications: 0,
      otpCodes: 0,
    };

    result.passwordResets = await new QueryBuilder('password_resets').where('expires_at', '<', now).delete();
    result.verifications = await new QueryBuilder('email_verifications').where('expires_at', '<', now).delete();
    result.otpCodes = await new QueryBuilder('otp_codes').where('expires_at', '<', now).delete();
    result.otpCodes += await new QueryBuilder('otp_codes').whereNotNull('used_at').delete();

    console.log(
      `[CleanupExpiredTokens] Deleted: ${result.passwordResets} password resets, ` +
      `${result.verifications} email verifications, ${result.otpCodes} OTP codes`
    );
  }
}
