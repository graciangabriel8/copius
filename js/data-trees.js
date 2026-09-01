// Work trees — an ingredient at the core, its preparations as branches.
// Pilot: potato only. Each branch carries the technique, the variety it needs,
// concrete tips, and the pairings that work *in that form* — which differ per branch.
window.TREES = (window.TREES || []).concat([

{id:"potato", branches:[

  {id:"puree", name:{en:"Purée",fr:"Purée"},
   variety:{en:"Floury — bintje, agria, russet",fr:"Farineuse — bintje, agria, russet"},
   technique:{en:"Cook them whole and unpeeled so they take on no water, then peel while too hot to hold. Pass through a ricer or a food mill — never a blender, which bursts the starch cells and turns the whole thing to glue in seconds. Cold cubed butter first, then hot milk, off the heat.",
   fr:"Cuisez-les entières et non pelées pour qu’elles ne prennent pas l’eau, puis épluchez-les brûlantes. Passez au presse-purée ou au moulin à légumes — jamais au blender, qui fait éclater les cellules d’amidon et transforme le tout en colle en quelques secondes. Beurre froid en cubes d’abord, puis lait chaud, hors du feu."},
   tips:[{en:"Waxy potatoes will not make a good purée. The variety decides this before you start.",fr:"Une pomme de terre à chair ferme ne fera pas une bonne purée. La variété décide avant même de commencer."},
         {en:"Robuchon's version is up to half butter by weight. You do not have to go that far, but the butter goes in cold and the milk goes in hot — reverse it and it splits.",fr:"La version de Robuchon monte à moitié beurre en poids. Nul besoin d’aller si loin, mais le beurre entre froid et le lait chaud — l’inverse la fait trancher."}],
   pairs:["beurre-de-baratte","cream","nutmeg","black-pepper","chives","comte","garlic","olive-oil"]},

  {id:"roasted", name:{en:"Roasted",fr:"Rôties"},
   variety:{en:"Floury",fr:"Farineuse"},
   technique:{en:"Par-boil until the edges just soften, drain completely, then shake them hard in the dry pan until the surfaces go rough and floury. That broken surface is the whole crust. Into fat that is already shimmering, in a single layer, and left alone.",
   fr:"Précuisez jusqu’à ce que les arêtes s’attendrissent, égouttez à fond, puis secouez-les fermement dans la casserole sèche jusqu’à ce que la surface devienne rugueuse et farineuse. Cette surface éclatée fait toute la croûte. Dans une graisse déjà fumante, en une seule couche, et qu’on ne touche plus."},
   tips:[{en:"Crowding the tin steams them. Two tins beats one full one, every time.",fr:"Une plaque surchargée les cuit à la vapeur. Deux plaques valent toujours mieux qu’une pleine."},
         {en:"Duck fat and beef dripping hold a higher heat than butter and taste of more than oil.",fr:"La graisse de canard et celle de bœuf tiennent une chaleur plus vive que le beurre et ont plus de goût qu’une huile."}],
   pairs:["duck-fat","rosemary","garlic","thyme","lard","black-pepper","salt","bay-leaf"]},

  {id:"confites", name:{en:"Confit",fr:"Confites"},
   variety:{en:"Waxy or new",fr:"Chair ferme ou primeur"},
   technique:{en:"Submerged whole in fat held at around 85–90°C — low enough that nothing fries. The fat is a cooking medium, not a fryer: it conducts heat evenly and keeps air off the surface. They should stay pale until you raise the heat at the very end.",
   fr:"Immergées entières dans une graisse tenue autour de 85–90 °C — assez basse pour que rien ne frise. La graisse est un milieu de cuisson, non une friture : elle conduit la chaleur uniformément et écarte l’air de la surface. Elles doivent rester pâles jusqu’à ce qu’on monte le feu tout à la fin."},
   tips:[{en:"If it bubbles vigorously the fat is too hot. You want the barest tremble.",fr:"Si ça bouillonne franchement, la graisse est trop chaude. On cherche un frémissement à peine visible."},
         {en:"Strain the fat and keep it. It gets better each time you use it.",fr:"Filtrez la graisse et gardez-la. Elle s’améliore à chaque usage."}],
   pairs:["duck-fat","garlic","thyme","bay-leaf","rosemary","black-pepper","shallot","lard"]},

  {id:"gratin", name:{en:"Gratin",fr:"Gratin"},
   variety:{en:"Waxy or all-purpose",fr:"Chair ferme ou polyvalente"},
   technique:{en:"Sliced two or three millimetres thin and — this is the part people get wrong — never rinsed. The surface starch is what thickens the cream into a sauce. Simmer the slices in the cream on the stove first, then bake; going straight to the oven leaves them chalky.",
   fr:"Taillées à deux ou trois millimètres et — c’est là qu’on se trompe — jamais rincées. L’amidon de surface est ce qui lie la crème en sauce. Faites d’abord frémir les tranches dans la crème sur le feu, puis enfournez ; passer directement au four les laisse crayeuses."},
   tips:[{en:"A true dauphinois has no cheese and no egg. Cream, garlic, nutmeg, and time.",fr:"Un vrai dauphinois n’a ni fromage ni œuf. Crème, ail, muscade, et du temps."},
         {en:"Rub the dish with a cut garlic clove rather than adding chopped garlic, which catches and burns.",fr:"Frottez le plat d’une gousse coupée plutôt que d’ajouter de l’ail haché, qui accroche et brûle."}],
   pairs:["cream","garlic","nutmeg","comte","beaufort","black-pepper","thyme","creme-epaisse"]},

  {id:"gnocchi", name:{en:"Gnocchi",fr:"Gnocchi"},
   variety:{en:"Floury",fr:"Farineuse"},
   technique:{en:"Bake the potatoes rather than boiling them — boiled ones drink water, and every gram of water costs you a gram of flour later. Rice them hot and let the steam escape. Then the least flour you can get away with, worked fast and barely at all.",
   fr:"Cuisez les pommes de terre au four plutôt qu’à l’eau — bouillies elles boivent, et chaque gramme d’eau se paie en un gramme de farine ensuite. Passez-les chaudes au presse-purée et laissez la vapeur s’échapper. Puis le moins de farine possible, travaillée vite et à peine."},
   tips:[{en:"Every extra handful of flour makes them tougher. The dough should feel barely holdable.",fr:"Chaque poignée de farine en trop les rend plus fermes. La pâte doit tenir tout juste."},
         {en:"They are done seconds after they float. Waiting turns them to paste.",fr:"Ils sont prêts quelques secondes après avoir remonté. Attendre les transforme en pâte."}],
   pairs:["flour-t55","egg","parmesan","sage","beurre-de-baratte","nutmeg","black-pepper","semolina"]},

  {id:"frites", name:{en:"Chips",fr:"Frites"},
   variety:{en:"Floury",fr:"Farineuse"},
   technique:{en:"Cut, rinse off the loose starch, then dry them properly — water is what makes fat spit and skins go leathery. Two fries: around 150°C to cook them through without colour, cool completely, then 180–190°C to crisp. The rest between the two matters as much as either.",
   fr:"Taillez, rincez l’amidon libre, puis séchez-les vraiment — c’est l’eau qui fait crépiter la graisse et cuirasse la peau. Deux bains : environ 150 °C pour les cuire à cœur sans coloration, refroidissement complet, puis 180–190 °C pour croustiller. Le repos entre les deux compte autant que les bains."},
   tips:[{en:"One fry gives you either raw middles or burnt outsides. There is no single temperature that does both.",fr:"Un seul bain donne un cœur cru ou un extérieur brûlé. Aucune température ne fait les deux."},
         {en:"Salt them the instant they leave the fat, while the surface can still take it.",fr:"Salez-les à la seconde où elles sortent du bain, tant que la surface peut le prendre."}],
   pairs:["salt","peanut-oil","duck-fat","black-pepper","malt-vinegar","paprika","garlic","parsley"]}

]}

]);
