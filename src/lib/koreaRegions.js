const KOREA_SGG = {
  '서울특별시': ['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  '부산광역시': ['강서구','금정구','기장군','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구','해운대구'],
  '대구광역시': ['군위군','남구','달서구','달성군','동구','북구','서구','수성구','중구'],
  '인천광역시': ['강화군','검단구','계양구','남동구','미추홀구','부평구','서해구','연수구','영종구','옹진군','제물포구'],
  '전남광주통합특별시': ['강진군','고흥군','곡성군','광산구','광양시','구례군','나주시','남구','담양군','동구','목포시','무안군','보성군','북구','서구','순천시','신안군','여수시','영광군','영암군','완도군','장성군','장흥군','진도군','함평군','해남군','화순군'],
  '대전광역시': ['대덕구','동구','서구','유성구','중구'],
  '울산광역시': ['남구','동구','북구','울주군','중구'],
  '세종특별자치시': ['세종시'],
  '경기도': ['가평군','고양시덕양구','고양시일산동구','고양시일산서구','과천시','광명시','광주시','구리시','군포시','김포시','남양주시','동두천시','부천시소사구','부천시오정구','부천시원미구','성남시분당구','성남시수정구','성남시중원구','수원시권선구','수원시영통구','수원시장안구','수원시팔달구','시흥시','안산시단원구','안산시상록구','안성시','안양시동안구','안양시만안구','양주시','양평군','여주시','연천군','오산시','용인시기흥구','용인시수지구','용인시처인구','의왕시','의정부시','이천시','파주시','평택시','포천시','하남시','화성시동탄구','화성시만세구','화성시병점구','화성시효행구'],
  '강원특별자치도': ['강릉시','고성군','동해시','삼척시','속초시','양구군','양양군','영월군','원주시','인제군','정선군','철원군','춘천시','태백시','평창군','홍천군','화천군','횡성군'],
  '충청북도': ['괴산군','단양군','보은군','영동군','옥천군','음성군','제천시','증평군','진천군','청주시상당구','청주시서원구','청주시청원구','청주시흥덕구','충주시'],
  '충청남도': ['계룡시','공주시','금산군','논산시','당진시','보령시','부여군','서산시','서천군','아산시','예산군','천안시동남구','천안시서북구','청양군','태안군','홍성군'],
  '경상북도': ['경산시','경주시','고령군','구미시','김천시','문경시','봉화군','상주시','성주군','안동시','영덕군','영양군','영주시','영천시','예천군','울릉군','울진군','의성군','청도군','청송군','칠곡군','포항시남구','포항시북구'],
  '경상남도': ['거제시','거창군','고성군','김해시','남해군','밀양시','사천시','산청군','양산시','의령군','진주시','창녕군','창원시마산합포구','창원시마산회원구','창원시성산구','창원시의창구','창원시진해구','통영시','하동군','함안군','함양군','합천군'],
  '제주특별자치도': ['서귀포시','제주시'],
  '전북특별자치도': ['고창군','군산시','김제시','남원시','무주군','부안군','순창군','완주군','익산시','임실군','장수군','전주시덕진구','전주시완산구','정읍시','진안군'],
}

const EMD_URL = 'https://cdn.jsdelivr.net/gh/DevMinGeonPark/mapcn-kr@main/data/emd.json'
let emdPromise = null

export const koreaSidoOptions = Object.keys(KOREA_SGG)

export function koreaSggOptions(sido) {
  return KOREA_SGG[sido] || []
}

export function formatKoreaSggName(name = '') {
  return String(name).replace(/^(.+시)([^\s]+구)$/, '$1 $2')
}

export function buildKoreaDestination({ sido = '', sgg = '', dong = '' } = {}) {
  if (!sido) return ''
  return ['대한민국', sido, sgg ? formatKoreaSggName(sgg) : '', dong].filter(Boolean).join(' ')
}

export function parseKoreaDestination(value = '') {
  const text = String(value || '').trim()
  if (!text.startsWith('대한민국 ')) return null
  const body = text.slice(5).trim()
  const sido = koreaSidoOptions.find((candidate) => body === candidate || body.startsWith(`${candidate} `))
  if (!sido) return null
  const rest = body.slice(sido.length).trim()
  if (!rest) return { sido, sgg: '', dong: '' }
  const sgg = koreaSggOptions(sido).find((candidate) => {
    const pretty = formatKoreaSggName(candidate)
    return rest === candidate || rest.startsWith(`${candidate} `) || rest === pretty || rest.startsWith(`${pretty} `)
  }) || ''
  if (!sgg) return { sido, sgg: '', dong: rest }
  const rawPrefix = rest.startsWith(sgg) ? sgg : formatKoreaSggName(sgg)
  return { sido, sgg, dong: rest.slice(rawPrefix.length).trim() }
}

async function loadEmdGeoJson() {
  if (!emdPromise) {
    emdPromise = fetch(EMD_URL, { cache: 'force-cache' }).then(async (response) => {
      if (!response.ok) throw new Error('세부 행정구역을 불러오지 못했어요.')
      return response.json()
    }).catch((error) => {
      emdPromise = null
      throw error
    })
  }
  return emdPromise
}

export async function loadKoreaDongOptions(sido, sgg) {
  if (!sido || !sgg) return []
  const data = await loadEmdGeoJson()
  const names = (data?.features || [])
    .map((feature) => feature?.properties)
    .filter((props) => props?.sidonm === sido && props?.sggnm === sgg && props?.dong)
    .map((props) => props.dong)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'ko'))
}
