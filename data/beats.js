// Beat practice: sentences whose meaning rides on a few stressed words (beats), with the "glue"
// between them squeezed in fast. Stages are the number of beats per sentence.
// Each item is [Japanese meaning, pattern, decoys].
// Pattern: plain words are beats; [glue|katakana] is glue with a rough guide to its reduced sound.
// Decoys are words that sound close to a beat but are clearly different words; the listening
// test mixes them with the beats.

export const STAGES = [2, 3, 4, 5];

const RAW = {
  2: [
    ['ケンが電話をくれる予定です。', 'Ken [is going to|ズゴナ] call.', 'cold, Kim'],
    ['母は仕事をしなければなりません。', 'Mom [has to|ハスタ] work.', 'walk, mop'],
    ['リサは踊りたがっています。', 'Lisa [wants to|ワンツァ] dance.', 'dense, Lily'],
    ['サムは昔、泳いでいました。', 'Sam [used to|ユースタ] swim.', 'swing, some'],
    ['お茶がちょっと熱いです。', 'Tea [is kind of|ズカインダ] hot.', 'hat, key'],
    ['お昼ごはんはかばんの中です。', 'Lunch [is in the|ズィンナ] bag.', 'back, launch'],
    ['鍵は机の上にあります。', '[The|ダ] keys [are on the|アロンナ] desk.', 'disk, kiss'],
    ['ジャックはゲートにいます。', 'Jack [is at the|ズアッダ] gate.', 'get, Jake'],
    ['アンは運転できます。', 'Ann [can|クン] drive.', 'dry, and'],
    ['ニックは車の中にいました。', 'Nick [was in the|ワズィンナ] car.', 'card, neck'],
    ['マイクが手伝ってくれます。', "Mike['ll|ル] help.", 'hope, make'],
    ['エマは聞くべきでした。', 'Emma [should have|シュダ] asked.', 'ax, Anna'],
    ['ベンは勝てたはずなのに。', 'Ben [could have|クダ] won.', 'want, Ken'],
    ['ケイトなら来たでしょう。', 'Kate [would have|ウダ] come.', 'calm, gate'],
    ['フレッドはとても楽しみました。', 'Fred [had a lot of|ハダラダ] fun.', 'fan, red'],
    ['子どもたちは遊びたがっています。', 'Kids [want to|ワナ] play.', 'pray, kiss'],
    ['スーは町を出ています。', 'Sue [is out of|ズアウダ] town.', 'tone, see'],
    ['ジョーはスペイン出身です。', 'Joe [is from|ズフム] Spain.', 'spine, show'],
    ['ピートはビーチに行く予定です。', "Pete [is going to the|ズゴナダ] beach.", 'peach, bit'],
    ['ジムが中に入れてくれました。', 'Jim [let me|レミ] in.', 'end, Jane'],
    ['彼に助けを求めて。', 'Ask [him for|イムファ] help.', 'half, ax'],
    ['私がここにいると伝えて。', "Tell [them I'm|ムアイム] here.", 'hair, tall'],
    ['手を貸して。', 'Give [me a|ミア] hand.', 'hint, gift'],
    ['そのうちいくつかは新しいです。', 'Some [of them are|アヴェマ] new.', 'sun, knee'],
    ['誰を知っていますか？', 'Who [do you|ダヤ] know?', 'new, how'],
  ],
  3: [
    ['リサはチームのために料理をする予定です。', 'Lisa [is going to|ズゴナ] cook [for the|ファダ] team.', 'book, tea, Lily'],
    ['ケンは報告書を仕上げなければなりません。', 'Ken [has to|ハスタ] finish [the|ダ] report.', 'fish, sport, can'],
    ['子どもたちは雪の中で遊びたがっています。', 'Kids [want to|ワナ] play [in the|インナ] snow.', 'slow, pray, kiss'],
    ['母は猫と一緒に台所にいます。', 'Mom [is in the|ズィンナ] kitchen [with the|ウィダ] cat.', 'cut, chicken, mop'],
    ['サムは昔ロンドンに住んでいました。', 'Sam [used to|ユースタ] live [in|イン] London.', 'leave, sum, Lindon'],
    ['エイミーはフランス語を少し話せます。', 'Amy [can|クン] speak [a bit of|アビダ] French.', 'fresh, speech, Annie'],
    ['ジャックは上司に電話すべきでした。', 'Jack [should have|シュダ] called [his|イズ] boss.', 'cold, bus, Jake'],
    ['アンならそのショーを気に入ったでしょう。', 'Ann [would have|ウダ] loved [the|ダ] show.', 'laughed, snow, and'],
    ['ニックは牛乳と卵を切らしています。', 'Nick [is out of|ズアウダ] milk [and|ン] eggs.', 'bags, mink, neck'],
    ['マイクはコンサートでとても楽しみました。', 'Mike [had a lot of|ハダラダ] fun [at the|アッダ] concert.', 'fan, concept, make'],
    ['エマは仕事に少しうんざりしています。', 'Emma [is kind of|ズカインダ] tired [of her|アヴァ] job.', 'tied, chop, Anna'],
    ['スーは9時に駅にいました。', 'Sue [was at the|ワザッダ] station [at|アッ] nine.', 'nice, nation, see'],
    ['ベンが玄関で会ってくれます。', "Ben['ll|ル] meet [you at the|ヤアッダ] door.", 'mitt, dog, bin'],
    ['ケイトはケーキを持ってくる予定です。', 'Kate [is going to|ズゴナ] bring [some|サム] cake.', 'brick, cape, gate'],
    ['今朝電話したと彼に伝えて。', 'Tell [him I|イマイ] called [this|ディス] morning.', 'cold, warning, tall'],
    ['ゲートで待つよう彼らに頼んで。', 'Ask [them to|ムタ] wait [at the|アッダ] gate.', 'wet, get, ax'],
    ['着いたら電話してね。', 'Give [me a|ミア] call [when you|ウェニュ] land.', 'lend, cold, gift'],
    ['夕食は何がいい？', 'What [do you|ダヤ] want [for|ファ] dinner?', 'winner, won\'t, hot'],
    ['車をどこに停めたの？', 'Where [did you|ディジュ] park [the|ダ] car?', 'pack, card, wear'],
    ['窓を開けてもらえますか？', '[Could you|クッジュ] open [the|ダ] window, please?', 'widow, ocean, peace'],
    ['今夜考えさせて。', 'Let [me|ミ] think [about it|アバウディッ] tonight.', 'sink, light, lit'],
    ['学生の何人かは遅刻しました。', 'Some [of the|アヴダ] students [were|ワ] late.', 'rate, Sunday, sun'],
    ['ピートはタクシーに乗るべきでした。', 'Pete [should have|シュダ] taken [a|ア] taxi.', 'taxes, token, peach'],
    ['ジムはもっと早く言ってくれてもよかったのに。', 'Jim [could have|クダ] told [us|アス] sooner.', 'summer, toll, Jane'],
    ['フレッドはバスまで走らなければなりませんでした。', 'Fred [had to|ハッタ] run [to the|タダ] bus.', 'boss, ran, red'],
  ],
  4: [
    ['ケイトは息子を学校に連れて行かなければなりません。', 'Kate [has to|ハスタ] take [her|ァ] son [to|タ] school.', 'cool, sin, tick'],
    ['ケンは昼食後にお母さんに電話する予定です。', 'Ken [is going to|ズゴナ] call [his|イズ] mom [after|アフタ] lunch.', 'launch, cold, mop'],
    ['リサはお姉さんへのプレゼントを買いたがっています。', 'Lisa [wants to|ワンツァ] buy [a|ア] gift [for her|ファハ] sister.', 'guest, sitter, boy'],
    ['サムは昔、雨の中を歩いて通勤していました。', 'Sam [used to|ユースタ] walk [to|タ] work [in the|インナ] rain.', 'word, train, wok'],
    ['エイミーはピアノとギターが弾けます。', 'Amy [can|クン] play [the|ダ] piano [and the|アンダ] guitar.', 'pray, Annie, pin'],
    ['マイクは出発前に地図を確認すべきでした。', 'Mike [should have|シュダ] checked [the|ダ] map [before|ビフォア] leaving.', 'mop, chick, living'],
    ['エマはその映画を観たかったでしょう。', 'Emma [would have|ウダ] liked [to|タ] see [the|ダ] movie.', 'lied, moody, she'],
    ['ベンはゴールを決めれば試合に勝てたのに。', 'Ben [could have|クダ] won [the|ダ] game [with a|ウィダ] goal.', 'gold, came, want'],
    ['ニックは家のコーヒーと砂糖を切らしています。', 'Nick [is out of|ズアウダ] coffee [and|ン] sugar [at|アッ] home.', 'copy, hope, shook'],
    ['アンは今朝1時間銀行にいました。', 'Ann [was at the|ワザッダ] bank [for an|ファラン] hour [this|ディス] morning.', 'bag, warning, owl'],
    ['マイクは金曜日のコンサートでとても楽しみました。', 'Mike [had a lot of|ハダラダ] fun [at the|アッダ] concert [on|オン] Friday.', 'fan, fried, concept'],
    ['スーは6月にパリへ飛ぶ予定です。', 'Sue [is going to|ズゴナ] fly [to|タ] Paris [in|イン] June.', 'free, Jane, pear'],
    ['ホテルに着いたら電話してね。', 'Give [me a|ミア] call [when you|ウェニュ] get [to the|タダ] hotel.', 'cold, hostel, gate'],
    ['6時に駅で会おうと彼に伝えて。', 'Tell [him to|イムタ] meet [us at the|アサッダ] station [at|アッ] six.', 'sick, mitt, nation'],
    ['今週末は何をしたい？', 'What [do you|ダヤ] want [to|タ] do [this|ディス] weekend?', 'won\'t, week, dew'],
    ['旅行用のその靴、どこで買ったの？', 'Where [did you|ディジュ] buy [those|ドウズ] shoes [for your|ファヤ] trip?', 'choose, tip, boy'],
    ['子どもたちは放課後、湖で泳ぎたがっています。', 'Kids [want to|ワナ] swim [in the|インナ] lake [after|アフタ] school.', 'lack, cool, swing'],
    ['フレッドは寒い中バスを待たなければなりませんでした。', 'Fred [had to|ハッタ] wait [for the|ファダ] bus [in the|インナ] cold.', 'gold, boss, wet'],
    ['ピートが飲み物とお菓子を持ってきます。', "Pete['ll|ル] bring [some|サム] drinks [and|ン] snacks.", 'snakes, brick, drunk'],
    ['ジムが週末、車を貸してくれました。', 'Jim [let me|レミ] use [his|イズ] car [for the|ファダ] weekend.', 'card, news, week'],
    ['友達の何人かが結婚式に来ます。', 'Some [of my|アヴマイ] friends [are|ア] coming [to the|タダ] wedding.', 'bedding, French, calming'],
    ['昼食はあと10分でできます。', 'Lunch [will be|ルビ] ready [in|イン] ten minutes.', 'launch, tan, Eddie'],
    ['金曜までにファイルを送るよう頼んで。', 'Ask [them to|ムタ] send [the|ダ] file [by|バイ] Friday.', 'sand, fire, fried'],
    ['ジャックは月曜のテストのことを少し心配しています。', 'Jack [is kind of|ズカインダ] worried [about the|アバウダ] test [on|オン] Monday.', 'text, Sunday, hurried'],
    ['エマは夕食前に部屋を掃除しなければなりません。', 'Emma [has to|ハスタ] clean [her|ァ] room [before|ビフォア] dinner.', 'cream, thinner, rum'],
  ],
  5: [
    ['ケンは日曜に子どもたちを動物園に連れて行く予定です。', 'Ken [is going to|ズゴナ] take [his|イズ] kids [to the|タダ] zoo [on|オン] Sunday.', 'Monday, kiss, sue'],
    ['リサはお母さんのためにパン作りを覚えたがっています。', 'Lisa [wants to|ワンツァ] learn [to|タ] bake [some|サム] bread [for her|ファハ] mom.', 'bed, burn, back'],
    ['サムは大学時代、バンドでドラムを叩いていました。', 'Sam [used to|ユースタ] play [the|ダ] drums [in a|インナ] band [in|イン] college.', 'bend, dreams, collar'],
    ['エイミーはフランス語を少しとスペイン語をちょっと話せます。', 'Amy [can|クン] speak [a bit of|アビダ] French [and a|アンダ] little Spanish.', 'fresh, speech, middle'],
    ['マイクは昨日、計画の変更を伝えるべきでした。', 'Mike [should have|シュダ] told [us about the|アサバウダ] change [in the|インナ] plan yesterday.', 'chance, plane, toll'],
    ['エマは金曜に空いていたら夕食に来たでしょう。', 'Emma [would have|ウダ] joined [us for|アスファ] dinner [if she were|イフシワ] free [on|オン] Friday.', 'three, fried, joint'],
    ['ベンは8時に出ていれば電車に間に合ったのに。', "Ben [could have|クダ] caught [the|ダ] train [if he'd|イフイド] left [at|アッ] eight.", 'rain, lift, cut'],
    ['ニックは家の牛乳とパンと卵を切らしています。', 'Nick [is out of|ズアウダ] milk, bread, [and|ン] eggs [at|アッ] home.', 'bed, legs, hope'],
    ['アンは今朝、図書館に2、3時間いました。', 'Ann [was at the|ワザッダ] library [for a|ファラ] couple [of|アヴ] hours [this|ディス] morning.', 'copper, warning, owls'],
    ['スーは来月、京都のおばあちゃんを訪ねる予定です。', 'Sue [is going to|ズゴナ] visit [her|ァ] grandma [in|イン] Kyoto [next|ネクス] month.', 'Tokyo, mouth, busy'],
    ['ロンドンの空港に着いたら電話してね。', 'Give [me a|ミア] call [when you|ウェニュ] get [to the|タダ] airport [in|イン] London.', 'report, cold, gate'],
    ['月曜の会議にノートパソコンを持ってくるよう彼に伝えて。', 'Tell [him to|イムタ] bring [his|イズ] laptop [to the|タダ] meeting [on|オン] Monday.', 'eating, Sunday, brick'],
    ['今夜の夕食は何が食べたい？', 'What [do you|ダヤ] want [to|タ] eat [for|ファ] dinner tonight?', 'eight, winner, won\'t'],
    ['貸した車の鍵、どこに置いた？', 'Where [did you|ディジュ] put [the|ダ] keys [to the|タダ] car [I|アイ] lent [you?|ユ]', 'kiss, lend, card'],
    ['子どもたちはビーチに行って砂の城を作りたがっています。', 'Kids [want to|ワナ] go [to the|タダ] beach [and|ン] build [a|ア] castle.', 'bill, cancel, peach'],
    ['フレッドは雨の中、1時間バスを待たなければなりませんでした。', 'Fred [had to|ハッタ] wait [for the|ファダ] bus [in the|インナ] rain [for an|ファラン] hour.', 'lane, boss, owl'],
    ['ピートが飲み物を、ケイトがケーキを持ってきます。', "Pete['ll|ル] bring [the|ダ] drinks [and|ン] Kate [the|ダ] cake.", 'gate, cape, brick'],
    ['ジムが山への旅行に車を貸してくれました。', 'Jim [let me|レミ] borrow [his|イズ] car [for a|ファラ] trip [to the|タダ] mountains.', 'fountains, tip, card'],
    ['友達の何人かが正午に駅で私たちと会う予定です。', 'Some [of my|アヴマイ] friends [are going to|アゴナ] meet [us at the|アサッダ] station [at|アッ] noon.', 'moon, nation, French'],
    ['お昼ごはんがもうすぐできるから、手を洗って。', 'Lunch [will be|ルビ] ready soon, [so|ソ] wash [your|ヤ] hands.', 'watch, hens, moon'],
    ['金曜までにファイルをリサに送るよう頼んで。', 'Ask [them to|ムタ] send [the|ダ] files [to|タ] Lisa [by|バイ] Friday.', 'fires, Lily, sand'],
    ['ジャックは月曜の就職面接で少し緊張しています。', 'Jack [is kind of|ズカインダ] nervous [about the|アバウダ] job interview [on|オン] Monday.', 'chop, Sunday, service'],
    ['エマは部屋の掃除と宿題をしなければなりません。', 'Emma [has to|ハスタ] clean [her|ァ] room [and|ン] do [her|ァ] homework.', 'cream, home, rum'],
    ['母は今夜の夕食にスープを作る予定です。', 'Mom [is going to|ズゴナ] make [some|サム] soup [for|ファ] dinner tonight.', 'soap, take, winner'],
    ['ケンとエイミーはもっと大きな家に引っ越す予定です。', 'Ken [and|ン] Amy [are going to|アゴナ] move [to a|タア] bigger house.', 'movie, mouse, figure'],
  ],
};

// Pattern -> parts. Beats are plain words; glue is "[text|kana]". Glue written right after a word
// with no space (as in "Mike['ll|ル]") is a contraction and joins that word in the sentence.
function parse(pattern) {
  const parts = [];
  for (const m of pattern.matchAll(/(\S*?)\[([^\]|]+)\|([^\]]+)\]|(\S+)/g)) {
    if (m[4]) {
      parts.push({ text: m[4], beat: true });
      continue;
    }
    if (m[1]) parts.push({ text: m[1], beat: true });
    parts.push({ text: m[2], kana: m[3], beat: false, attach: !!m[1] || m[2].startsWith("'") });
  }
  return parts;
}

const plain = w => w.replace(/[^A-Za-z']/g, '').toLowerCase();

export const BEAT_ITEMS = STAGES.flatMap(stage => RAW[stage].map(([ja, pattern, decoys], i) => {
  const parts = parse(pattern);
  const text = parts.reduce((s, p) => (s && !p.attach ? `${s} ${p.text}` : s + p.text), '');
  return {
    id: `s${stage}-${String(i + 1).padStart(2, '0')}`,
    stage,
    no: i + 1,
    ja,
    pattern,
    parts,
    text,
    beats: parts.filter(p => p.beat).map(p => plain(p.text)),
    decoys: decoys.split(',').map(d => d.trim().toLowerCase()),
  };
}));
