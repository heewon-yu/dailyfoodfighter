export const topicTerms: Readonly<Record<string, readonly string[]>> = {
  birth: ["첫만남", "유아학비", "임신", "출산", "산모", "산후", "육아", "영아", "유아", "보육", "어린이집", "양육", "아동", "부모급여", "다자녀", "신생아", "아이돌봄", "자녀"],
  youth: ["내일배움", "청년", "청소년", "대학생", "취업", "구직", "일자리", "장학", "직업훈련", "인턴", "학자금", "근로장려"],
  housing: ["주거", "월세", "전세", "임대", "주택", "주거급여", "이사", "보증금"],
  living: ["기초연금", "생계", "긴급", "생활비", "저소득", "취약계층", "에너지바우처", "기초생활", "공공요금", "생활안정", "취약"],
  health: ["기초연금", "의료", "건강", "돌봄", "장애", "어르신", "노인", "요양", "간병", "치료", "재활", "건강보험"],
  business: [],
};

export const facetTerms: Readonly<Record<string, readonly string[]>> = {
  all: [],
  pregnancy: ["임신", "임산부", "난임", "산전", "태아"],
  childbirth: ["출산", "신생아", "산후", "출생", "첫만남"],
  childcare: ["영유아", "영아", "어린이집", "보육", "양육", "돌봄", "유아", "아동수당"],
  multichild: ["다자녀", "셋째", "둘째", "가족", "자녀", "형제"],
  young: ["청년", "취업", "구직", "일자리", "직업훈련", "인턴"],
  student: ["학생", "장학", "학자금", "학교", "교육비", "대학"],
  rent: ["월세", "임차", "주거급여", "임대료", "공공임대"],
  jeonse: ["전세", "보증금", "주택자금", "주택대출"],
  living: ["기초연금", "생계", "긴급지원", "생활안정", "기초생활", "에너지바우처"],
  health: ["기초연금", "의료", "건강", "질환", "치료", "병원", "건강보험"],
  senior: ["노인", "어르신", "요양", "고령", "장기요양"],
  startup: ["예비창업", "창업", "사업화", "창업기업"],
  smallbiz: ["소상공인", "자영업", "소기업", "경영안정"],
  company: ["중소기업", "수출", "판로", "제조기업", "기업지원"],
};

export function matchesBrowseTopic(
  item: { title: string; summary?: string | null; category: string },
  topic: string,
  facet: string,
): boolean {
  const has = (terms: readonly string[]) => terms.some(term =>
    item.title.includes(term) || Boolean(item.summary?.includes(term)));
  const broad = topic === 'all' || (topic === 'business'
    ? item.category === 'FUND' : has(topicTerms[topic] ?? []));
  return broad && (facet === 'all' || has(facetTerms[facet] ?? []));
}
