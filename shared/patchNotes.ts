const PATCH_NOTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 패치노트 분류와 표시 순서를 소유하는 클래스형 enum. */
export class PatchNoteCategory {
    private static readonly all: PatchNoteCategory[] = []
    readonly key: string
    readonly label: string

    static readonly CONTENT = new PatchNoteCategory('content', '콘텐츠')
    static readonly SYSTEM = new PatchNoteCategory('system', '시스템')
    static readonly BALANCE = new PatchNoteCategory('balance', '밸런스')
    static readonly CONVENIENCE = new PatchNoteCategory('convenience', '편의성')
    static readonly FIX = new PatchNoteCategory('fix', '오류 수정')

    private constructor(key: string, label: string) {
        this.key = key
        this.label = label
        PatchNoteCategory.all.push(this)
    }

    static values(): readonly PatchNoteCategory[] { return PatchNoteCategory.all }
    static fromKey(key: string): PatchNoteCategory | undefined {
        return PatchNoteCategory.all.find(category => category.key === key.trim().toLowerCase())
    }
}

interface PatchNoteSectionDefinition {
    readonly category: PatchNoteCategory
    readonly items: readonly string[]
}

interface PatchNoteDefinition {
    readonly date: string
    readonly title: string
    readonly summary: string
    readonly sections: readonly PatchNoteSectionDefinition[]
}

export interface PatchNoteSectionSnapshot {
    readonly categoryKey: string
    readonly categoryLabel: string
    readonly items: readonly string[]
}

export interface PatchNoteSnapshot {
    readonly date: string
    readonly title: string
    readonly summary: string
    readonly sections: readonly PatchNoteSectionSnapshot[]
}

/**
 * 사용자에게 공개할 일별 변경 기록의 단일 기준.
 * 새 패치는 가장 위에 쓰지 않아도 getPatchNotes()가 날짜 역순으로 정렬한다.
 */
const PATCH_NOTES: readonly PatchNoteDefinition[] = [
    {
        date: '2026-07-23',
        title: '후반 세계, 직업 성장과 카르마',
        summary: '후반 모험 지역과 Lv.180까지의 직업 성장을 완성하고 튜토리얼·자동이동·악명 시스템을 실제 플레이 흐름에 연결했습니다.',
        sections: [
            {
                category: PatchNoteCategory.CONTENT,
                items: [
                    '역설기계고, 잿빛심연, 공허왕관 성채, 월식해구, 역근수해·태초심장 권역을 추가해 월드를 233개 장소로 확장했습니다.',
                    '각 후반 권역에 분기 경로, 지역 재료와 장비, 상점, 연속 퀘스트, 서로 다른 전투 흐름의 중간·최종 보스를 배치했습니다.',
                    '전사·궁수·암살자·마법사·대장장이의 Lv.75/100/140/180 성장 스킬과 화염·빙결·전격 상위 숙련 주문을 추가했습니다.',
                ],
            },
            {
                category: PatchNoteCategory.SYSTEM,
                items: [
                    '악행과 플레이어 처치로 누적되고 시간·사망·교단 헌금으로 감소하는 카르마 시스템을 추가했습니다.',
                    '고카르마 사망 패널티, 질서 상점·선량한 NPC 의뢰·교단 이용 제한과 현상 대상 처치자의 영웅 효과를 적용했습니다.',
                    '계정은 보존하면서 게임 진행 데이터만 초기화하는 운영 명령과 누적 플레이 24시간 미만 새싹 표시를 추가했습니다.',
                ],
            },
            {
                category: PatchNoteCategory.CONVENIENCE,
                items: [
                    '방문 장소를 대상으로 띄어쓰기·부분 이름·유사도를 지원하는 자동이동과 이동 취소 명령을 추가했습니다.',
                    '게임 안내 페이지와 실제 행동·장소·콘텐츠 완료를 검증하는 첫 모험 튜토리얼을 추가했습니다.',
                    '악명 단계 플레이어의 채팅 닉네임 옆에 🥀 표식을 표시하고 관리자 페이지에서 카르마를 확인·설정할 수 있게 했습니다.',
                    '햄버거 메뉴와 /패치노트 명령에서 일별 변경 사항을 최신순으로 확인할 수 있게 했습니다.',
                ],
            },
            {
                category: PatchNoteCategory.BALANCE,
                items: [
                    '모든 마법의 공용 재사용 대기시간을 0.5초, 같은 속성 마법의 공용 재사용 대기시간을 1초로 조정했습니다.',
                    '추천 장비와 모든 보유 스킬을 사용하는 동레벨 보스 프로파일로 상위 1차 직업과 Lv.200 엘리트 조합의 피해 편차를 1.5배 이내로 조정했습니다.',
                    '궁수·암살자의 주직업 공격 성장과 대장장이의 감각·제련 정밀도 계수, 마법사의 초중반·상위 속성 주문 성장 곡선을 조정했습니다.',
                ],
            },
            {
                category: PatchNoteCategory.FIX,
                items: [
                    '튜토리얼이 올바른 명령어와 실제 현재 장소를 확인하고, 낚시·광질·사냥의 성공 이벤트로만 완료되도록 수정했습니다.',
                    '자동이동 목적지 검색이 장소 이름의 띄어쓰기와 구분 기호를 무시하도록 수정했습니다.',
                ],
            },
        ],
    },
]

export function getPatchNotes(): PatchNoteSnapshot[] {
    return [...PATCH_NOTES]
        .sort((left, right) => right.date.localeCompare(left.date))
        .map(toSnapshot)
}

export function getPatchNote(dateInput: string): PatchNoteSnapshot | undefined {
    const date = normalizePatchNoteDateInput(dateInput)
    const note = PATCH_NOTES.find(candidate => candidate.date === date)
    return note ? toSnapshot(note) : undefined
}

export function formatPatchNoteDate(date: string): string {
    if (!PATCH_NOTE_DATE_PATTERN.test(date)) return date
    const [year, month, day] = date.split('-').map(Number)
    return `${year}년 ${month}월 ${day}일`
}

function normalizePatchNoteDateInput(input: string): string {
    const trimmed = input.trim()
    if (PATCH_NOTE_DATE_PATTERN.test(trimmed)) return trimmed
    const digits = trimmed.replace(/\D/g, '')
    return digits.length === 8
        ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
        : trimmed
}

function toSnapshot(note: PatchNoteDefinition): PatchNoteSnapshot {
    return {
        date: note.date,
        title: note.title,
        summary: note.summary,
        sections: note.sections.map(section => ({
            categoryKey: section.category.key,
            categoryLabel: section.category.label,
            items: [...section.items],
        })),
    }
}
