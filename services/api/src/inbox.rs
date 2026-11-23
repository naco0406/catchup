//! 가르기(4단계 · design.md 6장) — 들어온 것 한 건씩을 셋으로 나눠요.
//!
//! - 물어봐요(ask): 내 답이 있어야 다음으로 가요 → 결정 카드
//! - 알려만 드려요(fyi): 정할 것은 없지만 알아야 해요 → 소식 카드
//! - 넘겨요(skip): 올리지 않아요. 기록은 남고, 내가 카드로 올릴 수 있어요
//!
//! 순서는 규칙(코드) → 모델 → 애매하면 올려요. 놓친 결정이 잘못 올라온 카드보다 훨씬 비싸요.
//! 모델은 글과 갈래만 정해요. 서버가 지키는 것:
//! - 답장은 **보낸 사람에게만** 가요. 모델은 받는 사람을 고를 수 없어요
//! - 추천은 위험하지 않은 답에만 서요. 돈을 보낸다는 글은 모델이 낮다고 해도 위험으로 올려요
//! - 사람이 나에게 직접 보낸 글은 조용히 넘기지 않아요(적어도 알려만 드려요). 자동으로 온 글은 모델의 판단대로 넘겨요
//! - 모델이 거듭 엉뚱하게 답해도 글은 사라지지 않아요 — 있는 그대로 카드로 올려요
//! - 원문은 가를 때까지만 두고, 가른 뒤에는 짧은 발췌만 남겨요

use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgConnection;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    cards,
    codex::request::visible,
    db::Db,
    error::{Error, Result},
    model::{CardOption, Effect, NewCard, Risk},
};

const MAX_TEXT: usize = 20_000;
const EXCERPT: usize = 280;
/// 답의 이름이 가질 수 있는 가장 긴 길이. 모델에는 한 줄(영어 32자 · 한국어 20자)을 시키고, 그래도 넘친 것은 여기서 잘라요 —
/// 휴대폰의 답 단추에서 두 줄을 넘지 않게(docs/design/simple-ui 6장)
pub const LABEL_MAX: usize = 64;
/// 모델이 이만큼 엉뚱하게 답하면 있는 그대로 올려요
pub const MAX_TRIES: i32 = 3;
const SHOWN: i64 = 100;

/// 커넥터가 넘겨주는 글 하나
#[derive(Clone, Debug, Deserialize)]
pub struct Incoming {
    /// 그 커넥터에서 이 글의 이름
    #[serde(alias = "ref")]
    pub id: String,
    /// 같은 대화. 없으면 글 하나가 대화 하나예요
    #[serde(default)]
    pub thread: Option<String>,
    pub from: String,
    #[serde(default)]
    pub org: String,
    #[serde(default = "yes")]
    pub direct: bool,
    #[serde(default)]
    pub list: bool,
    /// 사람이 쓴 것이 아니라 자동으로 온 글(영수증 · 알림 · 발신 전용 주소)
    #[serde(default)]
    pub auto: bool,
    #[serde(default)]
    pub subject: String,
    pub text: String,
    #[serde(default)]
    pub received_at: Option<DateTime<Utc>>,
}

fn yes() -> bool {
    true
}

/// 가를 글
#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Item {
    pub id: Uuid,
    pub connector: String,
    pub thread: String,
    pub sender: String,
    pub org: String,
    pub direct: bool,
    pub list: bool,
    pub auto: bool,
    pub subject: String,
    pub text: String,
    pub received_at: DateTime<Utc>,
    pub tries: i32,
}

/// 모델(또는 규칙)이 낸 것. 믿지 않는 값이라 서버가 다시 걸러요
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Sorted {
    pub lane: String,
    #[serde(default)]
    pub reason: String,
    /// 물어봐요: 정할 것을 묻는 한 문장 · 알려만 드려요: 소식 한 줄
    #[serde(default)]
    pub question: String,
    #[serde(default)]
    pub summary: Vec<String>,
    #[serde(default)]
    pub options: Vec<Choice>,
    #[serde(default)]
    pub recommended: i32,
    /// YYYY-MM-DD. 글에 기한이 있을 때만
    #[serde(default)]
    pub due: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct Choice {
    pub label: String,
    #[serde(default)]
    pub detail: String,
    /// 보낸 사람에게 갈 답장. 비면 아무것도 보내지 않는 답이에요
    #[serde(default)]
    pub reply: String,
    /// low · money · irreversible
    #[serde(default)]
    pub risk: String,
}

/// 가른 기록(화면의 '넘긴 것')
#[derive(Clone, Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Entry {
    pub id: Uuid,
    pub sender: String,
    pub subject: String,
    pub excerpt: String,
    /// ask · fyi · skip
    pub lane: String,
    pub reason: Option<String>,
    /// rule · model · plain(모델 없이 있는 그대로)
    pub sorted_by: String,
    pub card: Option<Uuid>,
    /// 내가 카드로 올렸어요
    pub raised: bool,
    pub received_at: DateTime<Utc>,
}

fn clip(text: &str, max: usize) -> String {
    let text = visible(&text.split_whitespace().collect::<Vec<_>>().join(" "));
    if text.chars().count() <= max { text } else { format!("{}…", text.chars().take(max).collect::<String>()) }
}

/// 들어온 글을 받아 둬요. 같은 글이 다시 와도 하나예요. 돌려주는 것은 새로 받은 수
pub async fn receive(db: &Db, cell: Uuid, connector: &str, items: &[Incoming]) -> Result<usize> {
    let mut tx = db.cell_tx(cell).await?;
    let mut fresh = 0;
    for item in items {
        let text: String = item.text.chars().filter(|c| *c != '\0').take(MAX_TEXT).collect();
        if item.id.trim().is_empty() || item.from.trim().is_empty() || text.trim().is_empty() {
            return Err(Error::Invalid("bad_item"));
        }
        let thread = item.thread.as_deref().filter(|t| !t.trim().is_empty()).unwrap_or(&item.id);
        let added = sqlx::query(
            "INSERT INTO catchup.inbox_items (cell, connector, ref, thread, sender, org, direct, list, auto, subject, text, received_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, now())) ON CONFLICT (cell, connector, ref) DO NOTHING",
        )
        .bind(cell)
        .bind(connector)
        .bind(item.id.trim())
        .bind(thread.trim())
        .bind(clip(&item.from, 200))
        .bind(clip(&item.org, 200))
        .bind(item.direct)
        .bind(item.list)
        .bind(item.auto)
        .bind(clip(&item.subject, 500))
        .bind(text)
        .bind(item.received_at)
        .execute(&mut *tx)
        .await?;
        fresh += usize::try_from(added.rows_affected()).unwrap_or(0);
    }
    tx.commit().await?;
    Ok(fresh)
}

const ITEM: &str = "id, connector, thread, sender, org, direct, list, auto, subject, text, received_at, tries";

/// 가장 오래 기다린 글
pub async fn next(db: &Db, cell: Uuid) -> Result<Option<Item>> {
    let mut tx = db.cell_tx(cell).await?;
    let item = sqlx::query_as(&format!("SELECT {ITEM} FROM catchup.inbox_items WHERE state = 'new' ORDER BY received_at, id LIMIT 1"))
        .fetch_optional(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(item)
}

/// 기한 · 동의 · 결제 · 만료처럼 '안 하면 일이 생기는' 낱말. 이런 글은 단체 메일이어도 규칙으로 넘기지 않아요
const MATTERS: &[&str] = &[
    "까지",
    "기한",
    "만료",
    "해지",
    "중지",
    "정지",
    "동의",
    "결제",
    "미납",
    "연체",
    "승인",
    "서명",
    "갱신",
    "확인 필요",
    "조치",
    "expire",
    "deadline",
    "due ",
    "overdue",
    "suspend",
    "cancel",
    "payment",
    "consent",
    "agree",
    "approve",
    "sign ",
    "renew",
    "action required",
    "by ",
];

/// 모델에 묻지 않고 가를 수 있는 것: 단체로 온 글(뉴스레터 · 광고)이고, 놓치면 일이 생길 낱말이 없을 때만 넘겨요
pub fn by_rule(item: &Item) -> Option<Sorted> {
    if !item.list || item.direct {
        return None;
    }
    let text = format!("{} {}", item.subject, item.text).to_lowercase();
    if MATTERS.iter().any(|word| text.contains(word)) {
        return None;
    }
    Some(Sorted { lane: "skip".into(), reason: "단체로 온 글이에요".into(), ..Sorted::default() })
}

/// 돈을 보내거나 내겠다는 글 — 모델이 낮다고 해도 위험으로 올려요
fn pays(reply: &str) -> bool {
    const WORDS: &[&str] = &["송금", "이체", "입금하", "결제하", "결제해", "지불", "wire ", "transfer ", "i'll pay", "i will pay"];
    let reply = reply.to_lowercase();
    WORDS.iter().any(|word| reply.contains(word))
}

fn risk_of(choice: &Choice) -> Risk {
    let named = match choice.risk.trim() {
        "" | "low" => Risk::Low,
        "money" => Risk::Money,
        "production" => Risk::Production,
        // 모르는 이름은 가장 조심스럽게
        _ => Risk::Irreversible,
    };
    if named == Risk::Low && pays(&choice.reply) { Risk::Money } else { named }
}

struct Made {
    options: Vec<CardOption>,
    recommended: i32,
    risk: Risk,
}

/// 모델이 낸 답 → 선택지. 받는 사람은 보낸 사람으로 고정해요
fn options_from(sorted: &Sorted, sender: &str, ko: bool) -> Made {
    let mut options: Vec<CardOption> = sorted
        .options
        .iter()
        .filter(|c| !c.label.trim().is_empty())
        .take(4)
        .map(|c| {
            let label = clip(&c.label, LABEL_MAX);
            let reply = visible(c.reply.trim()).chars().take(4000).collect::<String>();
            let (effect, done) = match (reply.is_empty(), ko) {
                (true, true) => (Effect::None, format!("적어 뒀어요: {label}")),
                (true, false) => (Effect::None, format!("Noted: {label}")),
                (false, true) => (Effect::Send { to: sender.to_owned(), text: reply }, format!("답장을 보냈어요: {label}")),
                (false, false) => (Effect::Send { to: sender.to_owned(), text: reply }, format!("Reply sent: {label}")),
            };
            CardOption { detail: clip(&c.detail, 200), risk: risk_of(c), done, effect, label }
        })
        .collect();
    let wanted = usize::try_from(sorted.recommended).ok().filter(|i| options.get(*i).is_some_and(|o| o.risk == Risk::Low));
    let safe = wanted.or_else(|| options.iter().position(|o| o.risk == Risk::Low));
    // 위험하지 않은 답이 하나도 없으면 아무것도 보내지 않는 답을 더해 그것을 추천해요. 그런 카드는 밀어서 넘길 수 없어요
    let worst = [Risk::Irreversible, Risk::Production, Risk::Money].into_iter().find(|risk| options.iter().any(|o| o.risk == *risk));
    let risk = if safe.is_some() { Risk::Low } else { worst.unwrap_or(Risk::Low) };
    let recommended = safe.unwrap_or_else(|| {
        options.push(later(ko));
        options.len() - 1
    });
    Made { options, recommended: i32::try_from(recommended).unwrap_or(0), risk }
}

fn later(ko: bool) -> CardOption {
    CardOption {
        label: if ko { "지금은 답하지 않아요" } else { "Don’t reply for now" }.to_owned(),
        detail: if ko { "아무것도 보내지 않아요" } else { "Nothing is sent" }.to_owned(),
        risk: Risk::Low,
        done: if ko { "답하지 않기로 했어요" } else { "Left unanswered" }.to_owned(),
        effect: Effect::None,
    }
}

fn seen(ko: bool) -> CardOption {
    CardOption {
        label: if ko { "확인했어요" } else { "Seen" }.to_owned(),
        detail: if ko { "아무것도 보내지 않아요" } else { "Nothing is sent" }.to_owned(),
        risk: Risk::Low,
        done: if ko { "확인했다고 표시했어요" } else { "Marked as seen" }.to_owned(),
        effect: Effect::None,
    }
}

/// 제목이 없으면 보낸 사람만
fn headline(sender: &str, subject: &str) -> String {
    if subject.trim().is_empty() { sender.to_owned() } else { format!("{sender}: {subject}") }
}

#[derive(sqlx::FromRow)]
struct Held {
    connector: String,
    thread: String,
    reference: String,
    sender: String,
    org: String,
    direct: bool,
    list: bool,
    auto: bool,
    subject: String,
    text: Option<String>,
    excerpt: String,
    state: String,
    card: Option<Uuid>,
    lane: Option<String>,
    ko: bool,
    time_zone: String,
}

async fn hold(conn: &mut PgConnection, id: Uuid) -> Result<Held> {
    sqlx::query_as(
        "SELECT i.connector, i.thread, i.ref AS reference, i.sender, i.org, i.direct, i.list, i.auto, i.subject, i.text, i.excerpt, i.state, i.card,
                i.lane, c.lang = 'ko' AS ko, c.time_zone
         FROM catchup.inbox_items i JOIN catchup.cells c ON c.cell = i.cell WHERE i.id = $1 FOR UPDATE OF i",
    )
    .bind(id)
    .fetch_optional(conn)
    .await?
    .ok_or(Error::NotFound)
}

/// 그날의 끝(그 칸의 시간대) — 기한이 날짜로만 왔을 때
async fn end_of(conn: &mut PgConnection, day: &str, time_zone: &str) -> Result<Option<DateTime<Utc>>> {
    let Ok(day) = day.trim().parse::<NaiveDate>() else { return Ok(None) };
    let at: Option<DateTime<Utc>> = sqlx::query_scalar("SELECT ($1::date + interval '1 day' - interval '1 second') AT TIME ZONE $2")
        .bind(day)
        .bind(time_zone)
        .fetch_one(conn)
        .await?;
    // 너무 먼 날짜는 기한으로 치지 않아요(모델이 해를 틀리게 읽은 것)
    Ok(at.filter(|at| *at < Utc.with_ymd_and_hms(2100, 1, 1, 0, 0, 0).single().unwrap_or_else(Utc::now)))
}

/// 같은 대화의 앞선 열린 · 미룬 카드를 접어요 — 새 글이 왔으니 새 카드로 물어요
async fn fold_earlier(conn: &mut PgConnection, connector: &str, thread: &str) -> Result<()> {
    let earlier: Vec<Uuid> = sqlx::query_scalar(
        "SELECT d.id FROM catchup.decision_cards d JOIN catchup.inbox_items i ON i.cell = d.cell AND i.card = d.id
         WHERE i.connector = $1 AND i.thread = $2 AND d.state IN ('open', 'snoozed')",
    )
    .bind(connector)
    .bind(thread)
    .fetch_all(&mut *conn)
    .await?;
    for id in earlier {
        cards::set_state(conn, id, "expired", None, false).await?;
    }
    Ok(())
}

struct Draft<'a> {
    kind: &'a str,
    question: String,
    summary: Vec<String>,
    made: Made,
    due_at: Option<DateTime<Utc>>,
}

async fn put_card(conn: &mut PgConnection, cell: Uuid, item: Uuid, held: &Held, draft: Draft<'_>) -> Result<Uuid> {
    fold_earlier(conn, &held.connector, &held.thread).await?;
    let asking = draft.kind != "fyi";
    let card = NewCard {
        dedupe_key: format!("inbox:{item}"),
        kind: draft.kind.to_owned(),
        source: json!({ "type": held.connector, "from": held.sender, "org": held.org }),
        source_ref: format!("{}:{}", held.connector, held.thread),
        source_version: held.reference.clone(),
        question: draft.question,
        body: json!({ "summary": draft.summary }),
        options: if asking { draft.made.options } else { vec![] },
        recommended: if asking { draft.made.recommended } else { 0 },
        risk: if asking { draft.made.risk } else { Risk::Low },
        reply_path: if asking { "send" } else { "none" }.to_owned(),
        waiting: false,
        due_at: draft.due_at,
    };
    let id = cards::create_in(conn, cell, &card).await?;
    // 로컬 커넥터는 '원본이 그사이 바뀌었는지'를 이 표로 알아요(답이 나가기 전에 새 글이 오면 다시 여쭤봐요)
    if held.connector == "local" {
        sqlx::query(
            "INSERT INTO catchup.local_sources (cell, ref, version) VALUES ($1, $2, $3)
             ON CONFLICT (cell, ref) DO UPDATE SET version = EXCLUDED.version",
        )
        .bind(cell)
        .bind(&card.source_ref)
        .bind(&card.source_version)
        .execute(&mut *conn)
        .await?;
    }
    Ok(id)
}

async fn mark(
    conn: &mut PgConnection,
    item: Uuid,
    lane: &str,
    reason: &str,
    by: &str,
    card: Option<Uuid>,
    excerpt: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE catchup.inbox_items SET state = 'sorted', lane = $2, reason = $3, sorted_by = $4, card = $5, excerpt = $6, text = NULL, sorted_at = now()
         WHERE id = $1",
    )
    .bind(item)
    .bind(lane)
    .bind(clip(reason, 300))
    .bind(by)
    .bind(card)
    .bind(excerpt)
    .execute(conn)
    .await?;
    Ok(())
}

/// 있는 그대로 올리는 카드 — 모델 없이. 아무것도 보내지 않아요
fn plain(held: &Held, excerpt: &str) -> Draft<'static> {
    Draft {
        kind: "choose",
        question: headline(&held.sender, &held.subject),
        summary: vec![excerpt.to_owned()],
        made: Made { options: vec![seen(held.ko), later(held.ko)], recommended: 0, risk: Risk::Low },
        due_at: None,
    }
}

/// 가른 대로 처리해요. 이미 가른 글에는 얹지 않아요. 돌려주는 것은 생긴 카드
pub async fn settle(db: &Db, cell: Uuid, item: Uuid, sorted: &Sorted, by: &str) -> Result<Option<Uuid>> {
    let mut tx = db.cell_tx(cell).await?;
    let held = hold(&mut tx, item).await?;
    if held.state != "new" {
        return Ok(held.card);
    }
    let excerpt = clip(held.text.as_deref().unwrap_or_default(), EXCERPT);
    let person = held.direct && !held.list && !held.auto;
    let lane = match sorted.lane.as_str() {
        "ask" => "ask",
        "fyi" => "fyi",
        // 사람이 나에게 직접 보낸 글은 조용히 넘기지 않아요(자동으로 온 영수증 · 알림은 모델의 판단대로 넘겨요)
        "skip" if person => "fyi",
        "skip" => "skip",
        // 모르는 갈래는 올려요
        _ => "ask",
    };
    let question = clip(&sorted.question, 300);
    let summary: Vec<String> = sorted.summary.iter().map(|line| clip(line, 300)).filter(|line| !line.is_empty()).take(4).collect();
    let card = match lane {
        "skip" => None,
        "fyi" => {
            let draft = Draft {
                kind: "fyi",
                question: if question.is_empty() { headline(&held.sender, &held.subject) } else { question },
                summary: if summary.is_empty() { vec![excerpt.clone()] } else { summary },
                made: Made { options: vec![], recommended: 0, risk: Risk::Low },
                due_at: None,
            };
            Some(put_card(&mut tx, cell, item, &held, draft).await?)
        }
        _ => {
            let made = options_from(sorted, &held.sender, held.ko);
            // 물어봐요라면서 쓸 답이 없으면(더한 답 하나뿐이면) 있는 그대로 올려요
            let usable = !question.is_empty() && sorted.options.iter().any(|c| !c.label.trim().is_empty());
            let draft = if usable {
                let due_at = end_of(&mut tx, &sorted.due, &held.time_zone).await?;
                Draft {
                    kind: "reply",
                    question,
                    summary: if summary.is_empty() { vec![excerpt.clone()] } else { summary },
                    made,
                    due_at,
                }
            } else {
                plain(&held, &excerpt)
            };
            Some(put_card(&mut tx, cell, item, &held, draft).await?)
        }
    };
    mark(&mut tx, item, lane, &sorted.reason, by, card, &excerpt).await?;
    tx.commit().await?;
    Ok(card)
}

/// 모델이 엉뚱하게 답했어요. 세 번째에는 있는 그대로 카드로 올려요 — 글은 사라지지 않아요
pub async fn failed(db: &Db, cell: Uuid, item: Uuid) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    let held = hold(&mut tx, item).await?;
    if held.state != "new" {
        return Ok(());
    }
    let tries: i32 = sqlx::query_scalar("UPDATE catchup.inbox_items SET tries = tries + 1 WHERE id = $1 RETURNING tries")
        .bind(item)
        .fetch_one(&mut *tx)
        .await?;
    if tries >= MAX_TRIES {
        let excerpt = clip(held.text.as_deref().unwrap_or_default(), EXCERPT);
        let card = put_card(&mut tx, cell, item, &held, plain(&held, &excerpt)).await?;
        mark(&mut tx, item, "ask", "", "plain", Some(card), &excerpt).await?;
    }
    tx.commit().await?;
    Ok(())
}

/// 가른 기록(최근 것부터)
pub async fn list(db: &Db, cell: Uuid) -> Result<Vec<Entry>> {
    let mut tx = db.cell_tx(cell).await?;
    let rows = sqlx::query_as(
        "SELECT id, sender, subject, excerpt, lane, NULLIF(reason, '') AS reason, sorted_by, card, corrected IS NOT NULL AS raised, received_at
         FROM catchup.inbox_items WHERE state = 'sorted' ORDER BY sorted_at DESC, id LIMIT $1",
    )
    .bind(SHOWN)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

/// 넘긴 것을 내가 카드로 올려요 — 가르기가 틀렸다는 기록이에요. 두 번 눌러도 카드는 하나예요
pub async fn raise(db: &Db, cell: Uuid, item: Uuid) -> Result<Uuid> {
    let mut tx = db.cell_tx(cell).await?;
    let held = hold(&mut tx, item).await?;
    if let Some(card) = held.card {
        return Ok(card);
    }
    if held.state != "sorted" || held.lane.as_deref() != Some("skip") {
        return Err(Error::Conflict("not_skipped"));
    }
    let card = put_card(&mut tx, cell, item, &held, plain(&held, &held.excerpt)).await?;
    sqlx::query("UPDATE catchup.inbox_items SET card = $2, corrected = 'ask' WHERE id = $1")
        .bind(item)
        .bind(card)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(card)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(list: bool, direct: bool, text: &str) -> Item {
        Item {
            id: Uuid::nil(),
            connector: "local".into(),
            thread: "t".into(),
            sender: "보낸 곳".into(),
            org: String::new(),
            direct,
            list,
            auto: false,
            subject: String::new(),
            text: text.into(),
            received_at: Utc::now(),
            tries: 0,
        }
    }

    #[test]
    fn only_bulk_mail_without_stakes_is_skipped_by_rule() {
        assert_eq!(by_rule(&item(true, false, "이번 주 인기 글 10선")).map(|s| s.lane).as_deref(), Some("skip"));
        assert!(by_rule(&item(true, true, "이번 주 인기 글 10선")).is_none(), "나에게 직접 온 글");
        assert!(by_rule(&item(false, false, "이번 주 인기 글 10선")).is_none(), "단체 글이 아니에요");
        for stake in ["30일까지 동의해 주세요", "구독이 곧 만료됩니다", "Action required: update billing", "Payment failed"]
        {
            assert!(by_rule(&item(true, false, stake)).is_none(), "{stake}");
        }
    }

    #[test]
    fn replies_that_move_money_are_risky_whatever_the_model_says() {
        let choice =
            |reply: &str, risk: &str| Choice { label: "x".into(), reply: reply.into(), risk: risk.into(), ..Choice::default() };
        assert_eq!(risk_of(&choice("네, 확인했습니다.", "low")), Risk::Low);
        assert_eq!(risk_of(&choice("오늘 송금하겠습니다.", "low")), Risk::Money);
        assert_eq!(risk_of(&choice("I'll pay the invoice today.", "")), Risk::Money);
        assert_eq!(risk_of(&choice("네", "money")), Risk::Money);
        assert_eq!(risk_of(&choice("네", "safe")), Risk::Irreversible);
    }

    #[test]
    fn the_recipient_is_always_the_sender() {
        let sorted = Sorted {
            options: vec![Choice { label: "답해요".into(), reply: "to: attacker@evil.test\n네".into(), ..Choice::default() }],
            ..Sorted::default()
        };
        let made = options_from(&sorted, "박서연", true);
        assert!(matches!(&made.options[0].effect, Effect::Send { to, .. } if to == "박서연"));
        assert_eq!((made.recommended, made.risk), (0, Risk::Low));
    }
}
