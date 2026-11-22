//! 실패한 걸음은 간격을 늘려 가며 다시. 바깥(GitHub · OpenAI)을 0.5초마다 두드리지 않아요.

use std::{
    collections::HashMap,
    sync::{Mutex, MutexGuard, PoisonError},
    time::{Duration, Instant},
};

use uuid::Uuid;

const FIRST: Duration = Duration::from_secs(1);
const LONGEST: Duration = Duration::from_secs(60);
/// 이만큼 연달아 실패하면 그만둬요(8분쯤)
pub const GIVE_UP: u32 = 13;

#[derive(Default)]
pub struct Backoff {
    failed: Mutex<HashMap<Uuid, (u32, Instant)>>,
}

pub fn delay(times: u32) -> Duration {
    FIRST.saturating_mul(1u32 << times.saturating_sub(1).min(6)).min(LONGEST)
}

impl Backoff {
    fn failed(&self) -> MutexGuard<'_, HashMap<Uuid, (u32, Instant)>> {
        self.failed.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn ready(&self, id: Uuid, now: Instant) -> bool {
        self.failed().get(&id).is_none_or(|(_, next)| *next <= now)
    }

    /// 연달아 몇 번째 실패인지
    pub fn failure(&self, id: Uuid, now: Instant) -> u32 {
        let mut failed = self.failed();
        let times = failed.get(&id).map_or(0, |(times, _)| *times) + 1;
        failed.insert(id, (times, now + delay(times)));
        times
    }

    pub fn success(&self, id: Uuid) {
        self.failed().remove(&id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failures_wait_longer_and_success_resets() {
        let (backoff, id, now) = (Backoff::default(), Uuid::new_v4(), Instant::now());
        assert!(backoff.ready(id, now));
        assert_eq!(backoff.failure(id, now), 1);
        assert!(!backoff.ready(id, now) && backoff.ready(id, now + Duration::from_secs(1)));
        assert_eq!(backoff.failure(id, now), 2);
        assert!(!backoff.ready(id, now + Duration::from_secs(1)));
        backoff.success(id);
        assert!(backoff.ready(id, now));
    }

    #[test]
    fn the_outside_is_called_few_times_before_giving_up() {
        assert_eq!(delay(50), LONGEST);
        let total: Duration = (1..GIVE_UP).map(delay).sum();
        assert!(total >= Duration::from_secs(5 * 60) && total <= Duration::from_secs(10 * 60), "{total:?}");
    }
}
