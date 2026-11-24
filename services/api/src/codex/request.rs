//! 에이전트의 요청(승인 · 질문) ↔ 카드. DB · 프로세스를 모르는 순수 함수예요.
//!
//! - 보이는 명령 = 실행되는 명령. 숨은 글자(제어 · 방향 바꿈 · 폭 없는 글자)는 드러내고 위험으로 올려요.
//! - 말은 승인이 되지 않아요. 승인 요청에 말로 답하면 '거절 + 그 말'이에요.
//! - 비밀값은 묻지 않아요.

use serde_json::{Value, json};
use uuid::Uuid;

use crate::model::{CardOption, CodeChange, CodeLine, Effect, NewCard, Risk};

pub const PREFIX: &str = "codex-request:";
/// 이보다 긴 명령은 다 보여 줄 수 없으니 허용할 수 없어요
const MAX_SHOWN: usize = 6000;
const MAX_LINES: usize = 80;
const RECOMMENDED: &str = "(Recommended)";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Command,
    FileChange,
    Question,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Command => "command",
            Self::FileChange => "file_change",
            Self::Question => "question",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "command" => Self::Command,
            "file_change" => Self::FileChange,
            _ => Self::Question,
        }
    }

    pub fn of_method(method: &str) -> Option<Self> {
        match method {
            "item/commandExecution/requestApproval" => Some(Self::Command),
            "item/fileChange/requestApproval" => Some(Self::FileChange),
            "item/tool/requestUserInput" => Some(Self::Question),
            _ => None,
        }
    }
}

pub fn source_ref(request: Uuid) -> String {
    format!("{PREFIX}{request}")
}

pub fn request_of(source_ref: &str) -> Option<Uuid> {
    source_ref.strip_prefix(PREFIX)?.parse().ok()
}

fn hidden(c: char) -> bool {
    (c.is_control() && c != '\n' && c != '\t')
        || matches!(c, '\u{00ad}' | '\u{034f}' | '\u{061c}' | '\u{180e}' | '\u{200b}'..='\u{200f}' | '\u{2028}'..='\u{202e}')
        || matches!(c, '\u{2060}'..='\u{206f}' | '\u{feff}' | '\u{e0000}'..='\u{e007f}')
}

/// 숨은 글자를 드러내요
pub fn visible(text: &str) -> String {
    text.chars().map(|c| if hidden(c) { format!("\\u{{{:x}}}", c as u32) } else { c.to_string() }).collect()
}

fn clip(text: &str, max: usize) -> String {
    let mut out: String = visible(text).chars().take(max).collect();
    if text.chars().count() > max {
        out.push('…');
    }
    out
}

/// 샌드박스라도 되돌릴 수 없거나 운영을 만지려는 명령은 한 번 더 확인해요
pub fn risk(command: &str) -> Risk {
    if command.chars().any(hidden) || command.len() > MAX_SHOWN {
        return Risk::Irreversible;
    }
    let lower = command.to_lowercase();
    let words: Vec<&str> =
        lower.split(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))).filter(|w| !w.is_empty()).collect();
    let has = |word: &str| words.contains(&word);
    if ["production", "prod", "db:migrate", "kubectl", "terraform"].iter().any(|w| has(w) || (w.contains(':') && lower.contains(w))) {
        return Risk::Production;
    }
    let deletes = ["rm", "rmdir", "shred", "dd", "truncate", "mkfs", "sudo", "-delete"].iter().any(|w| has(w));
    let rewrites = has("git")
        && ((has("reset") && has("--hard"))
            || (has("clean") && words.iter().any(|w| w.starts_with("-f") || w.starts_with("-d") || w.starts_with("-x")))
            || (has("push") && (has("--force") || has("-f")))
            || (has("checkout") && (has("--") || has(".")))
            || has("filter-branch"));
    let drops = (has("drop") && (has("table") || has("database"))) || (has("delete") && has("from"));
    if deletes || rewrites || drops { Risk::Irreversible } else { Risk::Low }
}

pub struct Asking<'a> {
    pub id: Uuid,
    pub kind: Kind,
    pub params: &'a Value,
    /// 질문 하나(요청 하나에 1~3개)
    pub question: &'a Value,
    /// item/started 로 먼저 온 파일 바꿈
    pub changes: &'a Value,
    pub title: &'a str,
    pub ko: bool,
}

impl Asking<'_> {
    fn say(&self, ko: &str, en: &str) -> String {
        if self.ko { ko } else { en }.to_owned()
    }

    fn option(&self, label: String, detail: String, risk: Risk, reply: Value, code: Option<CodeChange>) -> CardOption {
        let done = if self.ko { format!("Codex에게 전했어요: {label}") } else { format!("Told Codex: {label}") };
        let effect = Effect::Tell { to: "Codex".into(), text: None, code, reply: Some(reply) };
        CardOption { label, detail, risk, done, effect }
    }

    fn decline(&self) -> CardOption {
        self.option(
            self.say("거절해요", "Decline"),
            self.say("이 단계를 건너뛰고 다른 길을 찾아요", "Skips this step and finds another way"),
            Risk::Low,
            json!({ "decision": "decline" }),
            None,
        )
    }

    fn stop(&self) -> CardOption {
        self.option(
            self.say("세션을 멈춰요", "Stop the session"),
            self.say("여기까지 바꾼 것은 남겨요", "Keeps the changes so far"),
            Risk::Low,
            json!({ "decision": "cancel" }),
            None,
        )
    }

    pub fn card(&self) -> NewCard {
        let (question, body, options, risk, kind) = match self.kind {
            Kind::Command => self.command(),
            Kind::FileChange => self.files(),
            Kind::Question => self.ask(),
        };
        let source_ref = source_ref(self.id);
        NewCard {
            dedupe_key: source_ref.clone(),
            kind: kind.into(),
            source: json!({ "type": "codex", "from": "Codex", "org": clip(self.title, 120) }),
            source_ref,
            source_version: "waiting".into(),
            question,
            body,
            options,
            recommended: 0,
            risk,
            reply_path: "send".into(),
            waiting: true,
            due_at: None,
        }
    }

    fn command(&self) -> (String, Value, Vec<CardOption>, Risk, &'static str) {
        let command = self.params["command"].as_str().unwrap_or_default();
        let risk = risk(command);
        let mut summary = vec![];
        if let Some(reason) = self.params["reason"].as_str().filter(|r| !r.trim().is_empty()) {
            summary.push(json!({ "text": clip(reason, 600) }));
        }
        let cwd = self.params["cwd"].as_str().unwrap_or("/workspace");
        let place = self.say("인터넷과 비밀값이 없는 샌드박스", "A sandbox with no internet and no secrets");
        summary.push(json!({ "text": format!("{place}, {}", clip(cwd, 200)), "dim": true }));
        if command.chars().any(hidden) {
            let warning =
                self.say("보이지 않는 글자가 들어 있어서 드러내 보였어요.", "It has hidden characters. They’re shown escaped.");
            summary.insert(0, json!({ "text": warning }));
        }

        // 다 보여 줄 수 없는 명령 · 무엇인지 모르는 명령은 허용 단추가 없어요
        let showable = !command.trim().is_empty() && command.len() <= MAX_SHOWN;
        let mut options = vec![];
        if showable {
            options.push(self.option(
                self.say("허용해요", "Allow"),
                self.say("샌드박스에서 이 명령을 실행해요", "Runs this command in the sandbox"),
                risk,
                json!({ "decision": "accept" }),
                None,
            ));
            let offered = self.params["availableDecisions"].as_array().is_some_and(|d| d.iter().any(|x| x == "acceptForSession"));
            if offered && risk == Risk::Low {
                options.push(self.option(
                    self.say("이 세션 동안 허용해요", "Allow for this session"),
                    self.say("같은 명령은 다시 묻지 않아요", "Won’t ask again for the same command"),
                    Risk::Low,
                    json!({ "decision": "acceptForSession" }),
                    None,
                ));
            }
        }
        // 위험하면 추천은 거절
        options.insert(if showable && risk == Risk::Low { options.len() } else { 0 }, self.decline());
        options.push(self.stop());
        let question = if showable {
            self.say("이 명령을 실행해도 될까요?", "Run this command?")
        } else {
            self.say(
                "다 보여 드릴 수 없는 명령이라 허용할 수 없어요. 어떻게 할까요?",
                "This command can’t be shown in full, so it can’t be allowed. What now?",
            )
        };
        let body = json!({ "summary": summary, "context": { "kind": "command", "cmd": format!("$ {}", clip(command, MAX_SHOWN)) } });
        (question, body, options, risk, "approve")
    }

    fn files(&self) -> (String, Value, Vec<CardOption>, Risk, &'static str) {
        let changes = self.changes.as_array().cloned().unwrap_or_default();
        let mut lines = vec![];
        let (mut add, mut del, mut total, mut concealed) = (0u32, 0u32, 0usize, false);
        let mut removes = false;
        for change in &changes {
            let kind = change["kind"]["type"].as_str().unwrap_or("update");
            removes |= kind == "delete";
            let path = change["path"].as_str().unwrap_or_default();
            concealed |= path.chars().any(hidden);
            if changes.len() > 1 {
                lines.push(CodeLine { t: "ctx".into(), s: clip(path, 300) });
            }
            for raw in change["diff"].as_str().unwrap_or_default().lines() {
                concealed |= raw.chars().any(hidden);
                let (tag, text) = match kind {
                    "add" => ("add", format!("+ {raw}")),
                    "delete" => ("del", format!("- {raw}")),
                    _ if raw.starts_with("+++") || raw.starts_with("---") => ("ctx", raw.to_owned()),
                    _ if raw.starts_with('+') => ("add", raw.to_owned()),
                    _ if raw.starts_with('-') => ("del", raw.to_owned()),
                    _ => ("ctx", raw.to_owned()),
                };
                add += u32::from(tag == "add");
                del += u32::from(tag == "del");
                total += 1;
                lines.push(CodeLine { t: tag.into(), s: clip(&text, 500) });
            }
        }
        let clipped = total > MAX_LINES;
        lines.truncate(MAX_LINES);
        let known = !changes.is_empty();
        // 내용을 못 봤거나 · 지우거나 · 숨은 글자가 있거나 · 다 못 보여 주면 한 번 더 확인
        let risk = if !known || removes || concealed || clipped { Risk::Irreversible } else { Risk::Low };
        let code = known.then(|| CodeChange {
            file: clip(changes[0]["path"].as_str().unwrap_or_default(), 300),
            add,
            del,
            files: changes.len() as u32,
            lines,
        });
        let allow = self.option(
            self.say("바꿔요", "Apply"),
            self.say("샌드박스의 작업 폴더만 바뀌어요", "Only the sandbox workspace changes"),
            risk,
            json!({ "decision": "accept" }),
            code,
        );
        let mut options = if risk == Risk::Low { vec![allow, self.decline()] } else { vec![self.decline(), allow] };
        options.push(self.stop());
        let mut summary = vec![];
        if let Some(reason) = self.params["reason"].as_str().filter(|r| !r.trim().is_empty()) {
            summary.push(json!({ "text": clip(reason, 600) }));
        }
        if clipped {
            let text = self.say("바뀌는 줄이 많아 앞부분만 보여요.", "Only the first part of the change is shown.");
            summary.push(json!({ "text": text }));
        }
        (self.say("파일을 이렇게 바꿔도 될까요?", "Apply this change?"), json!({ "summary": summary }), options, risk, "approve")
    }

    fn ask(&self) -> (String, Value, Vec<CardOption>, Risk, &'static str) {
        let question = self.question;
        let mut summary = vec![];
        if let Some(header) = question["header"].as_str().filter(|h| !h.trim().is_empty()) {
            summary.push(json!({ "text": clip(header, 120), "dim": true }));
        }
        let mut offered: Vec<&Value> = question["options"].as_array().into_iter().flatten().collect();
        // 에이전트가 추천한 것을 맨 위로
        offered.sort_by_key(|o| !o["label"].as_str().is_some_and(|l| l.trim_end().ends_with(RECOMMENDED)));
        let mut options: Vec<CardOption> = offered
            .iter()
            .filter_map(|o| Some((o["label"].as_str()?, o["description"].as_str().unwrap_or_default())))
            .filter(|(label, _)| !label.trim().is_empty())
            .take(4)
            .map(|(label, detail)| {
                let shown = label.trim_end().trim_end_matches(RECOMMENDED).trim_end();
                self.option(clip(shown, 160), clip(detail, 300), Risk::Low, json!({ "answer": label }), None)
            })
            .collect();
        if options.is_empty() {
            options.push(self.option(
                self.say("알아서 정해 주세요", "You decide"),
                self.say("다르게 답하려면 아래에 말로 적어 주세요", "Or type your answer below"),
                Risk::Low,
                json!({ "answer": self.say("알아서 정해 주세요", "You decide") }),
                None,
            ));
        }
        (clip(question["question"].as_str().unwrap_or_default(), 600), json!({ "summary": summary }), options, Risk::Low, "choose")
    }
}

/// 카드에서 고른 실행 → 저장할 답. 맞지 않으면 None
pub fn answer_of(kind: Kind, effect: &Effect) -> Option<Value> {
    let Effect::Tell { reply, text, .. } = effect else { return None };
    match (kind, reply, text) {
        (Kind::Question, Some(reply), _) => reply["answer"].as_str().map(|a| json!({ "answer": a })),
        (_, Some(reply), _) => match reply["decision"].as_str()? {
            d @ ("accept" | "acceptForSession" | "decline" | "cancel") => Some(json!({ "decision": d })),
            _ => None,
        },
        (Kind::Question, None, Some(text)) => Some(json!({ "answer": text })),
        (_, None, Some(text)) => Some(json!({ "decision": "decline", "note": text })),
        _ => None,
    }
}

/// '내가 직접 할게요'
pub fn left_to_the_person(kind: Kind) -> Value {
    match kind {
        Kind::Question => json!({ "answer": "The user will handle this themselves. Continue without it." }),
        _ => json!({ "decision": "decline", "note": "The user will handle this step themselves." }),
    }
}

/// app-server 에 돌려줄 값. `answers` 는 (질문 id, 저장한 답)
pub fn wire(kind: Kind, answers: &[(String, Value)]) -> Value {
    match kind {
        Kind::Question => {
            let by_id: serde_json::Map<String, Value> = answers
                .iter()
                .map(|(id, a)| (id.clone(), json!({ "answers": a["answer"].as_str().map(|s| vec![s]).unwrap_or_default() })))
                .collect();
            json!({ "answers": by_id })
        }
        _ => {
            let decision = answers.first().and_then(|(_, a)| a["decision"].as_str()).unwrap_or("decline");
            json!({ "decision": decision })
        }
    }
}

/// 재시작 뒤 새 차례로 건네는 말(에이전트에게 가는 글이라 영어)
pub fn recap(kind: Kind, params: &Value, question: &Value, answer: &Value) -> String {
    let quoted = |v: &Value| serde_json::to_string(v).unwrap_or_default();
    match kind {
        Kind::Question => format!("- You asked {}. The user answered {}.", quoted(&question["question"]), quoted(&answer["answer"])),
        Kind::Command | Kind::FileChange => {
            let what = match kind {
                Kind::Command => format!("to run the exact command {}", quoted(&params["command"])),
                _ => "to apply a file change".to_owned(),
            };
            let decided = match answer["decision"].as_str() {
                Some("accept" | "acceptForSession") => "approved it. It has not run yet, so do it now, unchanged",
                _ => "declined it. Do not do it",
            };
            let note = answer["note"].as_str().map(|n| format!(" The user said: {}", json!(n))).unwrap_or_default();
            format!("- You asked {what}. The user {decided}.{note}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(kind: Kind, params: Value, question: Value, changes: Value) -> NewCard {
        Asking { id: Uuid::nil(), kind, params: &params, question: &question, changes: &changes, title: "shop", ko: true }.card()
    }

    fn command(cmd: &str) -> NewCard {
        card(Kind::Command, json!({ "command": cmd, "availableDecisions": ["accept", "cancel"] }), Value::Null, Value::Null)
    }

    fn decision(option: &CardOption) -> String {
        answer_of(Kind::Command, &option.effect).unwrap()["decision"].as_str().unwrap().to_owned()
    }

    #[test]
    fn an_ordinary_command_recommends_allow() {
        let card = command("/bin/sh -lc 'cargo test'");
        assert_eq!((card.risk, decision(&card.options[0])), (Risk::Low, "accept".to_owned()));
        assert!(card.options.iter().any(|o| decision(o) == "decline") && card.options.iter().any(|o| decision(o) == "cancel"));
        assert!(!card.options.iter().any(|o| decision(o) == "acceptForSession"), "Codex 가 내주지 않은 선택지는 안 만들어요");
    }

    #[test]
    fn a_session_wide_allow_only_when_codex_offers_it() {
        let params = json!({ "command": "cargo test", "availableDecisions": ["accept", "acceptForSession"] });
        let card = card(Kind::Command, params, Value::Null, Value::Null);
        assert!(card.options.iter().any(|o| decision(o) == "acceptForSession"));
    }

    #[test]
    fn dangerous_commands_recommend_decline() {
        for cmd in [
            "/bin/sh -lc 'rm -rf .git'",
            "git reset --hard HEAD~3",
            "git push --force origin main",
            "git clean -fdx",
            "pnpm db:migrate --env production",
            "psql -c 'DROP TABLE orders'",
            "find . -name '*.ts' -delete",
            "sudo true",
            "/bin/sh -lc 'echo ok;rm x'",
        ] {
            let card = command(cmd);
            assert_ne!(card.risk, Risk::Low, "{cmd}");
            assert_eq!(decision(&card.options[0]), "decline", "{cmd}");
            assert_eq!(card.options[0].risk, Risk::Low, "{cmd}");
            assert!(card.options.iter().filter(|o| decision(o) == "accept").all(|o| o.risk != Risk::Low), "{cmd}");
        }
    }

    #[test]
    fn hidden_characters_are_shown_and_confirmed() {
        let card = command("echo safe \u{202e}hs.liave\u{200b}\u{1b}[2K");
        let shown = card.body["context"]["cmd"].as_str().unwrap();
        for escaped in ["\\u{202e}", "\\u{200b}", "\\u{1b}"] {
            assert!(shown.contains(escaped), "{shown}");
        }
        assert_ne!(card.risk, Risk::Low);
    }

    #[test]
    fn what_cannot_be_shown_cannot_be_allowed() {
        for cmd in [String::new(), "x".repeat(MAX_SHOWN + 1)] {
            assert!(command(&cmd).options.iter().all(|o| decision(o) != "accept"));
        }
        let unseen = card(Kind::FileChange, json!({}), Value::Null, Value::Null);
        assert_eq!(decision(&unseen.options[0]), "decline");
        assert_ne!(unseen.risk, Risk::Low);
    }

    #[test]
    fn a_file_change_shows_its_lines() {
        let changes = json!([{ "path": "src/retry.ts", "kind": { "type": "update" }, "diff": "@@\n-old\n+new\n" }]);
        let card = card(Kind::FileChange, json!({}), Value::Null, changes);
        let Effect::Tell { code: Some(code), .. } = &card.options[0].effect else { panic!("no code") };
        assert_eq!((code.add, code.del, code.files, code.file.as_str()), (1, 1, 1, "src/retry.ts"));
    }

    #[test]
    fn the_agents_recommendation_comes_first_and_replies_verbatim() {
        let question = json!({ "id": "q", "question": "어디에서?", "options": [
            { "label": "화면", "description": "작게" }, { "label": "서버 (Recommended)", "description": "한 번에" },
        ]});
        let card = card(Kind::Question, json!({}), question, Value::Null);
        assert_eq!(card.options[0].label, "서버");
        let answer = answer_of(Kind::Question, &card.options[0].effect).unwrap();
        assert_eq!(
            wire(Kind::Question, &[("q".into(), answer)]),
            json!({ "answers": { "q": { "answers": ["서버 (Recommended)"] } } })
        );
    }

    #[test]
    fn words_decline_an_approval_and_answer_a_question() {
        let said = Effect::Tell { to: "Codex".into(), text: Some("스테이징부터".into()), code: None, reply: None };
        let answer = answer_of(Kind::Command, &said).unwrap();
        assert_eq!(wire(Kind::Command, &[(String::new(), answer)]), json!({ "decision": "decline" }));
        assert_eq!(answer_of(Kind::Question, &said).unwrap(), json!({ "answer": "스테이징부터" }));
    }

    #[test]
    fn unknown_decisions_are_never_passed_through() {
        let reply = json!({ "decision": { "acceptWithExecpolicyAmendment": { "execpolicy_amendment": ["rm"] } } });
        let effect = Effect::Tell { to: "Codex".into(), text: None, code: None, reply: Some(reply) };
        assert_eq!(answer_of(Kind::Command, &effect), None);
    }
}
