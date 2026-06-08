(function () {
  "use strict";

  // Elements data compressed as arrays to minimize footprint
  // Format: [num, sym, name, mass, category, state_at_rt, melt_k, boil_k, configuration, discoverer, row, col]
  const RAW_ELEMENTS = [
    [1, "H", "Hydrogen", "1.008", "reactive-nonmetal", "gas", 14, 20, "1s¹", "Henry Cavendish", 1, 1],
    [2, "He", "Helium", "4.0026", "noble-gas", "gas", 1, 4, "1s²", "Pierre Janssen & Norman Lockyer", 1, 18],
    [3, "Li", "Lithium", "6.94", "alkali-metal", "solid", 453, 1615, "[He] 2s¹", "Johan August Arfwedson", 2, 1],
    [4, "Be", "Beryllium", "9.0122", "alkaline-earth-metal", "solid", 1560, 2742, "[He] 2s²", "Louis Nicolas Vauquelin", 2, 2],
    [5, "B", "Boron", "10.81", "metalloid", "solid", 2349, 4200, "[He] 2s² 2p¹", "Joseph Louis Gay-Lussac", 2, 13],
    [6, "C", "Carbon", "12.011", "reactive-nonmetal", "solid", 3823, 4300, "[He] 2s² 2p²", "Ancient Egypt", 2, 14],
    [7, "N", "Nitrogen", "14.007", "reactive-nonmetal", "gas", 63, 77, "[He] 2s² 2p³", "Daniel Rutherford", 2, 15],
    [8, "O", "Oxygen", "15.999", "reactive-nonmetal", "gas", 54, 90, "[He] 2s² 2p⁴", "Carl Wilhelm Scheele", 2, 16],
    [9, "F", "Fluorine", "18.998", "reactive-nonmetal", "gas", 53, 85, "[He] 2s² 2p⁵", "André-Marie Ampère", 2, 17],
    [10, "Ne", "Neon", "20.180", "noble-gas", "gas", 24, 27, "[He] 2s² 2p⁶", "Morris Travers & William Ramsay", 2, 18],
    [11, "Na", "Sodium", "22.990", "alkali-metal", "solid", 371, 1156, "[Ne] 3s¹", "Humphry Davy", 3, 1],
    [12, "Mg", "Magnesium", "24.305", "alkaline-earth-metal", "solid", 923, 1363, "[Ne] 3s²", "Joseph Black", 3, 2],
    [13, "Al", "Aluminium", "26.982", "post-transition-metal", "solid", 933, 2792, "[Ne] 3s² 3p¹", "Hans Christian Ørsted", 3, 13],
    [14, "Si", "Silicon", "28.085", "metalloid", "solid", 1687, 3538, "[Ne] 3s² 3p²", "Jöns Jacob Berzelius", 3, 14],
    [15, "P", "Phosphorus", "30.974", "reactive-nonmetal", "solid", 317, 553, "[Ne] 3s² 3p³", "Hennig Brand", 3, 15],
    [16, "S", "Sulfur", "32.06", "reactive-nonmetal", "solid", 388, 717, "[Ne] 3s² 3p⁴", "Ancient China", 3, 16],
    [17, "Cl", "Chlorine", "35.45", "reactive-nonmetal", "gas", 171, 239, "[Ne] 3s² 3p⁵", "Carl Wilhelm Scheele", 3, 17],
    [18, "Ar", "Argon", "39.948", "noble-gas", "gas", 83, 87, "[Ne] 3s² 3p⁶", "Lord Rayleigh & William Ramsay", 3, 18],
    [19, "K", "Potassium", "39.098", "alkali-metal", "solid", 336, 1032, "[Ar] 4s¹", "Humphry Davy", 4, 1],
    [20, "Ca", "Calcium", "40.078", "alkaline-earth-metal", "solid", 1115, 1757, "[Ar] 4s²", "Humphry Davy", 4, 2],
    [21, "Sc", "Scandium", "44.956", "transition-metal", "solid", 1814, 3109, "[Ar] 3d¹ 4s²", "Lars Fredrik Nilson", 4, 3],
    [22, "Ti", "Titanium", "47.867", "transition-metal", "solid", 1941, 3560, "[Ar] 3d² 4s²", "William Gregor", 4, 4],
    [23, "V", "Vanadium", "50.942", "transition-metal", "solid", 2183, 3680, "[Ar] 3d³ 4s²", "Andrés Manuel del Río", 4, 5],
    [24, "Cr", "Chromium", "51.996", "transition-metal", "solid", 2180, 2944, "[Ar] 3d⁵ 4s¹", "Louis Nicolas Vauquelin", 4, 6],
    [25, "Mn", "Manganese", "54.938", "transition-metal", "solid", 1519, 2334, "[Ar] 3d⁵ 4s²", "Johan Gottlieb Gahn", 4, 7],
    [26, "Fe", "Iron", "55.845", "transition-metal", "solid", 1811, 3134, "[Ar] 3d⁶ 4s²", "Ancient Egypt", 4, 8],
    [27, "Co", "Cobalt", "58.933", "transition-metal", "solid", 1768, 3200, "[Ar] 3d⁷ 4s²", "Georg Brandt", 4, 9],
    [28, "Ni", "Nickel", "58.693", "transition-metal", "solid", 1728, 3186, "[Ar] 3d⁸ 4s²", "Axel Fredrik Cronstedt", 4, 10],
    [29, "Cu", "Copper", "63.546", "transition-metal", "solid", 1358, 2835, "[Ar] 3d¹⁰ 4s¹", "Middle East", 4, 11],
    [30, "Zn", "Zinc", "65.38", "transition-metal", "solid", 692, 1180, "[Ar] 3d¹⁰ 4s²", "Indian chemists", 4, 12],
    [31, "Ga", "Gallium", "69.723", "post-transition-metal", "solid", 302, 2673, "[Ar] 3d¹⁰ 4s² 4p¹", "Paul-Émile Lecoq de Boisbaudran", 4, 13],
    [32, "Ge", "Germanium", "72.63", "metalloid", "solid", 1211, 3106, "[Ar] 3d¹⁰ 4s² 4p²", "Clemens Winkler", 4, 14],
    [33, "As", "Arsenic", "74.922", "metalloid", "solid", 1090, 887, "[Ar] 3d¹⁰ 4s² 4p³", "Albertus Magnus", 4, 15],
    [34, "Se", "Selenium", "78.971", "reactive-nonmetal", "solid", 494, 958, "[Ar] 3d¹⁰ 4s² 4p⁴", "Jöns Jacob Berzelius", 4, 16],
    [35, "Br", "Bromine", "79.904", "reactive-nonmetal", "liquid", 265, 332, "[Ar] 3d¹⁰ 4s² 4p⁵", "Antoine Jérôme Balard & Carl Jacob Löwig", 4, 17],
    [36, "Kr", "Krypton", "83.798", "noble-gas", "gas", 115, 119, "[Ar] 3d¹⁰ 4s² 4p⁶", "William Ramsay & Morris Travers", 4, 18],
    [37, "Rb", "Rubidium", "85.468", "alkali-metal", "solid", 312, 961, "[Kr] 5s¹", "Robert Bunsen & Gustav Kirchhoff", 5, 1],
    [38, "Sr", "Strontium", "87.62", "alkaline-earth-metal", "solid", 1050, 1655, "[Kr] 5s²", "Adair Crawford", 5, 2],
    [39, "Y", "Yttrium", "88.906", "transition-metal", "solid", 1799, 3609, "[Kr] 4d¹ 5s²", "Johan Gadolin", 5, 3],
    [40, "Zr", "Zirconium", "91.224", "transition-metal", "solid", 2128, 4682, "[Kr] 4d² 5s²", "Martin Heinrich Klaproth", 5, 4],
    [41, "Nb", "Niobium", "92.906", "transition-metal", "solid", 2750, 5017, "[Kr] 4d⁴ 5s¹", "Charles Hatchett", 5, 5],
    [42, "Mo", "Molybdenum", "95.95", "transition-metal", "solid", 2896, 4912, "[Kr] 4d⁵ 5s¹", "Carl Wilhelm Scheele", 5, 6],
    [43, "Tc", "Technetium", "98", "transition-metal", "solid", 2430, 4538, "[Kr] 4d⁵ 5s²", "Emilio Segrè & Carlo Perrier", 5, 7],
    [44, "Ru", "Ruthenium", "101.07", "transition-metal", "solid", 2607, 4423, "[Kr] 4d⁷ 5s¹", "Karl Ernst Claus", 5, 8],
    [45, "Rh", "Rhodium", "102.91", "transition-metal", "solid", 2237, 3968, "[Kr] 4d⁸ 5s¹", "William Hyde Wollaston", 5, 9],
    [46, "Pd", "Palladium", "106.42", "transition-metal", "solid", 1828, 3236, "[Kr] 4d¹⁰", "William Hyde Wollaston", 5, 10],
    [47, "Ag", "Silver", "107.87", "transition-metal", "solid", 1234, 2435, "[Kr] 4d¹⁰ 5s¹", "Prehistoric Period", 5, 11],
    [48, "Cd", "Cadmium", "112.41", "transition-metal", "solid", 594, 1040, "[Kr] 4d¹⁰ 5s²", "Karl Samuel Leberecht Hermann & Friedrich Stromeyer", 5, 12],
    [49, "In", "Indium", "114.82", "post-transition-metal", "solid", 429, 2345, "[Kr] 4d¹⁰ 5s² 5p¹", "Ferdinand Reich & Hieronymous Theodor Richter", 5, 13],
    [50, "Sn", "Tin", "118.71", "post-transition-metal", "solid", 505, 2875, "[Kr] 4d¹⁰ 5s² 5p²", "Prehistoric Period", 5, 14],
    [51, "Sb", "Antimony", "121.76", "metalloid", "solid", 903, 1860, "[Kr] 4d¹⁰ 5s² 5p³", "Prehistoric Period", 5, 15],
    [52, "Te", "Tellurium", "127.60", "metalloid", "solid", 722, 1261, "[Kr] 4d¹⁰ 5s² 5p⁴", "Franz-Joseph Müller von Reichenstein", 5, 16],
    [53, "I", "Iodine", "126.90", "reactive-nonmetal", "solid", 386, 457, "[Kr] 4d¹⁰ 5s² 5p⁵", "Bernard Courtois", 5, 17],
    [54, "Xe", "Xenon", "131.29", "noble-gas", "gas", 161, 165, "[Kr] 4d¹⁰ 5s² 5p⁶", "William Ramsay & Morris Travers", 5, 18],
    [55, "Cs", "Cesium", "132.91", "alkali-metal", "solid", 301, 944, "[Xe] 6s¹", "Robert Bunsen & Gustav Kirchhoff", 6, 1],
    [56, "Ba", "Barium", "137.33", "alkaline-earth-metal", "solid", 1000, 2170, "[Xe] 6s²", "Humphry Davy", 6, 2],
    [57, "La", "Lanthanum", "138.91", "lanthanide", "solid", 1193, 3737, "[Xe] 5d¹ 6s²", "Carl Gustaf Mosander", 9, 4],
    [58, "Ce", "Cerium", "140.12", "lanthanide", "solid", 1068, 3716, "[Xe] 4f¹ 5d¹ 6s²", "Martin Heinrich Klaproth, Jöns Jacob Berzelius & Wilhelm Hisinger", 9, 5],
    [59, "Pr", "Praseodymium", "140.91", "lanthanide", "solid", 1208, 3793, "[Xe] 4f³ 6s²", "Carl Auer von Welsbach", 9, 6],
    [60, "Nd", "Neodymium", "144.24", "lanthanide", "solid", 1297, 3347, "[Xe] 4f⁴ 6s²", "Carl Auer von Welsbach", 9, 7],
    [61, "Pm", "Promethium", "145", "lanthanide", "solid", 1315, 3273, "[Xe] 4f⁵ 6s²", "Charles D. Coryell, Jacob A. Marinsky & Lawrence E. Glendenin", 9, 8],
    [62, "Sm", "Samarium", "150.36", "lanthanide", "solid", 1345, 2067, "[Xe] 4f⁶ 6s²", "Paul-Émile Lecoq de Boisbaudran", 9, 9],
    [63, "Eu", "Europium", "151.96", "lanthanide", "solid", 1099, 1802, "[Xe] 4f⁷ 6s²", "Eugène-Anatole Demarçay", 9, 10],
    [64, "Gd", "Gadolinium", "157.25", "lanthanide", "solid", 1585, 3546, "[Xe] 4f⁷ 5d¹ 6s²", "Jean Charles Galissard de Marignac", 9, 11],
    [65, "Tb", "Terbium", "158.93", "lanthanide", "solid", 1629, 3503, "[Xe] 4f⁹ 6s²", "Carl Gustaf Mosander", 9, 12],
    [66, "Dy", "Dysprosium", "162.50", "lanthanide", "solid", 1680, 2840, "[Xe] 4f¹⁰ 6s²", "Paul-Émile Lecoq de Boisbaudran", 9, 13],
    [67, "Ho", "Holmium", "164.93", "lanthanide", "solid", 1734, 2993, "[Xe] 4f¹¹ 6s²", "Marc Delafontaine & Jacques-Louis Soret", 9, 14],
    [68, "Er", "Erbium", "167.26", "lanthanide", "solid", 1802, 3141, "[Xe] 4f¹² 6s²", "Carl Gustaf Mosander", 9, 15],
    [69, "Tm", "Thulium", "168.93", "lanthanide", "solid", 1818, 2223, "[Xe] 4f¹³ 6s²", "Per Teodor Cleve", 9, 16],
    [70, "Yb", "Ytterbium", "173.05", "lanthanide", "solid", 1097, 1469, "[Xe] 4f¹⁴ 6s²", "Jean Charles Galissard de Marignac", 9, 17],
    [71, "Lu", "Lutetium", "174.97", "lanthanide", "solid", 1925, 3675, "[Xe] 4f¹⁴ 5d¹ 6s²", "Georges Urbain", 9, 18],
    [72, "Hf", "Hafnium", "178.49", "transition-metal", "solid", 2506, 4876, "[Xe] 4f¹⁴ 5d² 6s²", "Dirk Coster & George de Hevesy", 6, 4],
    [73, "Ta", "Tantalum", "180.95", "transition-metal", "solid", 3290, 5731, "[Xe] 4f¹⁴ 5d³ 6s²", "Anders Gustaf Ekeberg", 6, 5],
    [74, "W", "Tungsten", "183.84", "transition-metal", "solid", 3695, 6203, "[Xe] 4f¹⁴ 5d⁴ 6s²", "Fausto & Juan José Elhuyar", 6, 6],
    [75, "Re", "Rhenium", "186.21", "transition-metal", "solid", 3459, 5869, "[Xe] 4f¹⁴ 5d⁵ 6s²", "Walter Noddack, Ida Tacke & Otto Berg", 6, 7],
    [76, "Os", "Osmium", "190.23", "transition-metal", "solid", 3306, 5285, "[Xe] 4f¹⁴ 5d⁶ 6s²", "Smithson Tennant", 6, 8],
    [77, "Ir", "Iridium", "192.22", "transition-metal", "solid", 2739, 4701, "[Xe] 4f¹⁴ 5d⁷ 6s²", "Smithson Tennant", 6, 9],
    [78, "Pt", "Platinum", "195.08", "transition-metal", "solid", 2041, 4098, "[Xe] 4f¹⁴ 5d⁹ 6s¹", "Antonio de Ulloa", 6, 10],
    [79, "Au", "Gold", "196.97", "transition-metal", "solid", 1337, 3129, "[Xe] 4f¹⁴ 5d¹⁰ 6s¹", "Prehistoric Period", 6, 11],
    [80, "Hg", "Mercury", "200.59", "transition-metal", "liquid", 234, 630, "[Xe] 4f¹⁴ 5d¹⁰ 6s²", "Prehistoric Period", 6, 12],
    [81, "Tl", "Thallium", "204.38", "post-transition-metal", "solid", 577, 1746, "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹", "William Crookes", 6, 13],
    [82, "Pb", "Lead", "207.2", "post-transition-metal", "solid", 601, 2022, "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²", "Prehistoric Period", 6, 14],
    [83, "Bi", "Bismuth", "208.98", "post-transition-metal", "solid", 544, 1837, "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³", "Claude François Geoffroy", 6, 15],
    [84, "Po", "Polonium", "209", "post-transition-metal", "solid", 527, 1235, "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴", "Marie & Pierre Curie", 6, 16],
    [85, "At", "Astatine", "210", "metalloid", "solid", 575, 610, "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵", "Dale R. Corson, Kenneth Ross MacKenzie & Emilio Segrè", 6, 17],
    [86, "Rn", "Radon", "222", "noble-gas", "gas", 202, 211, "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶", "Ernest Rutherford & Robert Owens", 6, 18],
    [87, "Fr", "Francium", "223", "alkali-metal", "solid", 300, 950, "[Rn] 7s¹", "Marguerite Perey", 7, 1],
    [88, "Ra", "Radium", "226", "alkaline-earth-metal", "solid", 973, 2010, "[Rn] 7s²", "Marie & Pierre Curie", 7, 2],
    [89, "Ac", "Actinium", "227", "actinide", "solid", 1323, 3471, "[Rn] 6d¹ 7s²", "Friedrich Oskar Giesel", 10, 4],
    [90, "Th", "Thorium", "232.04", "actinide", "solid", 2023, 5061, "[Rn] 6d² 7s²", "Jöns Jacob Berzelius", 10, 5],
    [91, "Pa", "Protactinium", "231.04", "actinide", "solid", 1841, 4300, "[Rn] 5f² 6d¹ 7s²", "Lise Meitner & Otto Hahn", 10, 6],
    [92, "U", "Uranium", "238.03", "actinide", "solid", 1405, 4404, "[Rn] 5f³ 6d¹ 7s²", "Martin Heinrich Klaproth", 10, 7],
    [93, "Np", "Neptunium", "237", "actinide", "solid", 917, 4273, "[Rn] 5f⁴ 6d¹ 7s²", "Edwin McMillan & Philip H. Abelson", 10, 8],
    [94, "Pu", "Plutonium", "244", "actinide", "solid", 912, 3501, "[Rn] 5f⁶ 7s²", "Glenn T. Seaborg, Arthur Wahl & Joseph W. Kennedy", 10, 9],
    [95, "Am", "Americium", "243", "actinide", "solid", 1449, 2880, "[Rn] 5f⁷ 7s²", "Glenn T. Seaborg, Ralph A. James & Albert Ghiorso", 10, 10],
    [96, "Cm", "Curium", "247", "actinide", "solid", 1613, 3383, "[Rn] 5f⁷ 6d¹ 7s²", "Glenn T. Seaborg, Ralph A. James & Albert Ghiorso", 10, 11],
    [97, "Bk", "Berkelium", "247", "actinide", "solid", 1259, 2900, "[Rn] 5f⁹ 7s²", "Glenn T. Seaborg, Stanley G. Thompson & Albert Ghiorso", 10, 12],
    [98, "Cf", "Californium", "251", "actinide", "solid", 1173, 1743, "[Rn] 5f¹⁰ 7s²", "Glenn T. Seaborg, Stanley G. Thompson & Albert Ghiorso", 10, 13],
    [99, "Es", "Einsteinium", "252", "actinide", "solid", 1133, 1269, "[Rn] 5f¹¹ 7s²", "Albert Ghiorso et al.", 10, 14],
    [100, "Fm", "Fermium", "257", "actinide", "synthetic", 1800, null, "[Rn] 5f¹² 7s²", "Albert Ghiorso et al.", 10, 15],
    [101, "Md", "Mendelevium", "258", "actinide", "synthetic", 1100, null, "[Rn] 5f¹³ 7s²", "Albert Ghiorso et al.", 10, 16],
    [102, "No", "Nobelium", "259", "actinide", "synthetic", 1100, null, "[Rn] 5f¹⁴ 7s²", "Nobel Institute for Physics", 10, 17],
    [103, "Lr", "Lawrencium", "266", "actinide", "synthetic", 1900, null, "[Rn] 5f¹⁴ 7d¹ 7s²", "Albert Ghiorso et al.", 10, 18],
    [104, "Rf", "Rutherfordium", "267", "transition-metal", "synthetic", 2400, 5800, "[Rn] 5f¹⁴ 6d² 7s²", "Joint Institute for Nuclear Research", 7, 4],
    [105, "Db", "Dubnium", "268", "transition-metal", "synthetic", null, null, "[Rn] 5f¹⁴ 6d³ 7s²", "Joint Institute for Nuclear Research", 7, 5],
    [106, "Sg", "Seaborgium", "269", "transition-metal", "synthetic", null, null, "[Rn] 5f¹⁴ 6d⁴ 7s²", "Lawrence Berkeley Laboratory", 7, 6],
    [107, "Bh", "Bohrium", "270", "transition-metal", "synthetic", null, null, "[Rn] 5f¹⁴ 6d⁵ 7s²", "Yuri Oganessian et al.", 7, 7],
    [108, "Hs", "Hassium", "269", "transition-metal", "synthetic", null, null, "[Rn] 5f¹⁴ 6d⁶ 7s²", "Gesellschaft für Schwerionenforschung", 7, 8],
    [109, "Mt", "Meitnerium", "278", "unknown", "synthetic", null, null, "[Rn] 5f¹⁴ 6d⁷ 7s²", "Peter Armbruster & Gottfried Münzenberg", 7, 9],
    [110, "Ds", "Darmstadtium", "281", "unknown", "synthetic", null, null, "[Rn] 5f¹⁴ 6d⁸ 7s²", "Sigurd Hofmann et al.", 7, 10],
    [111, "Rg", "Roentgenium", "282", "unknown", "synthetic", null, null, "[Rn] 5f¹⁴ 6d⁹ 7s²", "Sigurd Hofmann et al.", 7, 11],
    [112, "Cn", "Copernicium", "285", "transition-metal", "synthetic", 283, 340, "[Rn] 5f¹⁴ 6d¹⁰ 7s²", "Sigurd Hofmann et al.", 7, 12],
    [113, "Nh", "Nihonium", "286", "unknown", "synthetic", 700, 1400, "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p¹", "RIKEN", 7, 13],
    [114, "Fl", "Flerovium", "289", "unknown", "synthetic", 284, 340, "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p²", "Joint Institute for Nuclear Research", 7, 14],
    [115, "Mc", "Moscovium", "290", "unknown", "synthetic", 670, 1400, "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p³", "Joint Institute for Nuclear Research & Lawrence Livermore National Laboratory", 7, 15],
    [116, "Lv", "Livermorium", "293", "unknown", "synthetic", 637, 1035, "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁴", "Joint Institute for Nuclear Research & Lawrence Livermore National Laboratory", 7, 16],
    [117, "Ts", "Tennessine", "294", "unknown", "synthetic", 673, 823, "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁵", "Joint Institute for Nuclear Research, LLNL & Oak Ridge National Laboratory", 7, 17],
    [118, "Og", "Oganesson", "294", "unknown", "synthetic", 320, 350, "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶", "Joint Institute for Nuclear Research & Lawrence Livermore National Laboratory", 7, 18]
  ];

  const CUSTOM_DESCRIPTIONS = {
    1: "The lightest chemical element, constituting about 75% of the universe's elemental mass. Crucial component of water and all organic matter.",
    2: "A colorless, odorless, tasteless, non-toxic, and inert gas. The second lightest and second most abundant element in the observable universe.",
    3: "The lightest metal and the least dense solid element under standard conditions. Widely used in rechargeable batteries.",
    4: "A relatively rare metal in the universe, often forming in stars. Highly toxic, strong, and used in aerospace applications.",
    5: "A metalloid element commonly found in the mineral borax. Used in fiberglass, ceramics, and pyrotechnics.",
    6: "The chemical basis for all known organic life. Its unique bonding capability allows for diamonds, graphite, and complex bio-molecules.",
    7: "A dominant gas in Earth's atmosphere, making up about 78% of the air. Key component in fertilizers and proteins.",
    8: "An extremely reactive gas that readily forms oxides with most elements. Essential for cellular respiration in most living organisms.",
    9: "The most electronegative and reactive of all elements. Extremely toxic as a gas, but widely used in fluoridation and polymers.",
    10: "A noble gas that glows with a reddish-orange light when utilized in high-voltage electrical discharge signs.",
    26: "The most common element on Earth by mass, forming much of Earth's outer and inner core. The bedrock of human industrial infrastructure.",
    47: "A soft, white, lustrous transition metal. It exhibits the highest electrical conductivity, thermal conductivity, and reflectivity of any metal.",
    79: "A highly sought-after precious metal. Famous for its beauty, resistance to corrosion, high conductivity, and historical use as currency.",
    80: "The only metallic element that is liquid at standard conditions for temperature and pressure. Commonly known as quicksilver.",
    82: "A heavy metal denser than most common materials. Highly malleable and toxic, used in lead-acid batteries and radiation shielding.",
    92: "A heavy, radioactive metal. Historically used as a coloring agent in glass, now primarily used as an abundant source of concentrated energy via nuclear fission."
  };

  const CATEGORY_NAMES = {
    "reactive-nonmetal": "Reactive Nonmetal",
    "noble-gas": "Noble Gas",
    "alkali-metal": "Alkali Metal",
    "alkaline-earth-metal": "Alkaline Earth Metal",
    "metalloid": "Metalloid",
    "post-transition-metal": "Post-Transition Metal",
    "transition-metal": "Transition Metal",
    "lanthanide": "Lanthanide",
    "actinide": "Actinide",
    "unknown": "Unknown Properties"
  };

  // Parse raw elements into full objects
  const ELEMENTS = RAW_ELEMENTS.map(arr => ({
    num: arr[0],
    sym: arr[1],
    name: arr[2],
    mass: arr[3],
    cat: arr[4],
    state: arr[5],
    melt: arr[6],
    boil: arr[7],
    conf: arr[8],
    disc: arr[9],
    row: arr[10],
    col: arr[11]
  }));

  let currentWidget = null;
  let activeCategoryFilter = null;

  function widget() {
    return document.querySelector("[data-pt-widget]");
  }

  function qs(selector) {
    return currentWidget ? currentWidget.querySelector(selector) : null;
  }

  function getTranslation(key, fallback) {
    if (!currentWidget) return fallback;
    const attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    return currentWidget.getAttribute(attrName) || fallback;
  }

  function formatTemp(kelvin) {
    if (kelvin === null || isNaN(kelvin)) return "Unknown";
    const c = Math.round(kelvin - 273.15);
    return `${kelvin} K (${c} °C)`;
  }

  function getElementDescription(el) {
    if (CUSTOM_DESCRIPTIONS[el.num]) {
      return CUSTOM_DESCRIPTIONS[el.num];
    }
    const catName = CATEGORY_NAMES[el.cat] || el.cat;
    return `${el.name} is a chemical element with symbol ${el.sym} and atomic number ${el.num}. Classified as a ${catName}, it has a standard atomic weight of ${el.mass} u. It was discovered by ${el.disc || "unknown scientists"}.`;
  }

  function getSimulatedState(el, tempK) {
    if (el.state === "synthetic" || el.melt === null) return "synthetic";
    if (tempK < el.melt) return "solid";
    if (el.boil === null || tempK < el.boil) return "liquid";
    return "gas";
  }

  function formatElectronConfiguration(conf) {
    if (!conf) return "N/A";
    const nobleGasMatch = conf.match(/^(\[[A-Z][a-z]?\])\s*/);
    let nobleGasHtml = "";
    let remainder = conf;
    if (nobleGasMatch) {
      nobleGasHtml = `<span class="pt-conf-core">${nobleGasMatch[1]}</span>`;
      remainder = conf.slice(nobleGasMatch[0].length);
    }
    const orbitals = remainder.split(/\s+/).filter(Boolean);
    const orbitalsHtml = orbitals.map(orb => {
      const match = orb.match(/^(\d+)([spdf])(.*)$/);
      if (match) {
        const shell = match[1];
        const subshell = match[2];
        const power = match[3];
        return `<span class="pt-conf-orbital"><span class="pt-conf-shell">${shell}</span><span class="pt-conf-subshell subshell-${subshell}">${subshell}</span><sup class="pt-conf-power">${power}</sup></span>`;
      }
      return `<span class="pt-conf-orbital">${orb}</span>`;
    }).join("");
    return `${nobleGasHtml}${orbitalsHtml}`;
  }

  function updateDetailDisplay(el) {
    const content = qs(".pt-dd-content");
    const emptyMsg = qs(".pt-dd-empty");
    if (!content || !emptyMsg) return;

    if (!el) {
      // Show Hydrogen as default fallback
      el = ELEMENTS[0];
    }

    emptyMsg.style.display = "none";
    content.style.display = "flex";

    // Set border color match category and data-cat attribute for background gradients
    const detailPanel = qs("[data-pt-detail-display]");
    if (detailPanel) {
      detailPanel.style.borderLeft = `4px solid var(--pt-${el.cat})`;
      detailPanel.setAttribute("data-cat", el.cat);
    }

    content.querySelector("[data-dd-num]").textContent = el.num;
    content.querySelector("[data-dd-sym]").textContent = el.sym;
    content.querySelector("[data-dd-mass]").textContent = el.mass;
    content.querySelector("[data-dd-name]").textContent = el.name;
    content.querySelector("[data-dd-cat]").textContent = CATEGORY_NAMES[el.cat] || el.cat;
    content.querySelector("[data-dd-conf]").innerHTML = formatElectronConfiguration(el.conf);

    const slider = qs("[data-pt-temp-slider]");
    const currentTemp = slider ? parseInt(slider.value, 10) : 298;
    const simState = getSimulatedState(el, currentTemp);

    // Set data-state attribute on the state badge
    const stateBadge = content.querySelector("[data-dd-state-badge]");
    if (stateBadge) {
      stateBadge.setAttribute("data-state", simState);
    }

    content.querySelector("[data-dd-state]").textContent = getTranslation(simState, simState.charAt(0).toUpperCase() + simState.slice(1));
    content.querySelector("[data-dd-melt]").textContent = el.melt ? `${el.melt} K` : "N/A";
    content.querySelector("[data-dd-boil]").textContent = el.boil ? `${el.boil} K` : "N/A";
  }

  function showElementModal(el) {
    const modal = qs("[data-pt-modal]");
    if (!modal) return;

    modal.querySelector("[data-modal-badge]").style.borderColor = `var(--pt-${el.cat})`;
    modal.querySelector("[data-modal-num]").textContent = el.num;
    modal.querySelector("[data-modal-sym]").textContent = el.sym;
    modal.querySelector("[data-modal-name]").textContent = el.name;
    modal.querySelector("[data-modal-cat]").textContent = CATEGORY_NAMES[el.cat] || el.cat;
    modal.querySelector("[data-modal-mass]").textContent = el.mass;

    const rtState = getTranslation(el.state, el.state.charAt(0).toUpperCase() + el.state.slice(1));
    modal.querySelector("[data-modal-state]").textContent = rtState;
    modal.querySelector("[data-modal-melt]").textContent = el.melt ? formatTemp(el.melt) : "N/A";
    modal.querySelector("[data-modal-boil]").textContent = el.boil ? formatTemp(el.boil) : "N/A";
    modal.querySelector("[data-modal-conf]").innerHTML = formatElectronConfiguration(el.conf);
    modal.querySelector("[data-modal-disc]").textContent = el.disc || "Unknown";
    modal.querySelector("[data-modal-desc]").textContent = getElementDescription(el);

    modal.style.display = "flex";
  }

  function hideModal() {
    const modal = qs("[data-pt-modal]");
    if (modal) {
      modal.style.display = "none";
    }
  }

  function updateStatesForTemp(tempK) {
    const elements = currentWidget.querySelectorAll(".pt-element[data-num]");
    elements.forEach(cell => {
      const num = parseInt(cell.getAttribute("data-num"), 10);
      const el = ELEMENTS.find(e => e.num === num);
      if (!el) return;

      const simState = getSimulatedState(el, tempK);
      const dot = cell.querySelector("[data-state-dot]");
      if (dot) {
        dot.className = `state-indicator state-${simState}`;
      }
    });

    // Update active element preview stats
    const activeNum = qs("[data-dd-num]");
    if (activeNum) {
      const num = parseInt(activeNum.textContent, 10);
      const el = ELEMENTS.find(e => e.num === num);
      if (el) updateDetailDisplay(el);
    }
  }

  function filterByCategory(category) {
    const elements = currentWidget.querySelectorAll(".pt-element");
    const filterButtons = currentWidget.querySelectorAll("[data-category]");

    filterButtons.forEach(btn => {
      if (btn.getAttribute("data-category") === category) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    activeCategoryFilter = category;

    elements.forEach(cell => {
      const num = parseInt(cell.getAttribute("data-num"), 10);
      const placeholderCat = cell.getAttribute("data-placeholder-cat");

      if (placeholderCat) {
        if (!category || placeholderCat === category) {
          cell.classList.remove("dimmed");
        } else {
          cell.classList.add("dimmed");
        }
        return;
      }

      const el = ELEMENTS.find(e => e.num === num);
      if (!el) return;

      if (!category || el.cat === category) {
        cell.classList.remove("dimmed");
      } else {
        cell.classList.add("dimmed");
      }
    });
  }

  function searchElements(query) {
    const cleanQuery = query.trim().toLowerCase();
    const elements = currentWidget.querySelectorAll(".pt-element");
    const clearBtn = qs("[data-pt-clear-search]");

    if (clearBtn) {
      clearBtn.style.display = cleanQuery ? "block" : "none";
    }

    // Deactivate category filters during text search
    if (cleanQuery) {
      activeCategoryFilter = null;
      currentWidget.querySelectorAll("[data-category]").forEach(btn => btn.classList.remove("active"));
    }

    elements.forEach(cell => {
      const num = parseInt(cell.getAttribute("data-num"), 10);
      const placeholderCat = cell.getAttribute("data-placeholder-cat");

      if (!cleanQuery) {
        cell.classList.remove("dimmed", "highlighted");
        return;
      }

      if (placeholderCat) {
        cell.classList.add("dimmed");
        cell.classList.remove("highlighted");
        return;
      }

      const el = ELEMENTS.find(e => e.num === num);
      if (!el) return;

      const matchSym = el.sym.toLowerCase() === cleanQuery;
      const matchNum = String(el.num) === cleanQuery;
      const matchName = el.name.toLowerCase().includes(cleanQuery);
      const matchCat = (CATEGORY_NAMES[el.cat] || el.cat).toLowerCase().includes(cleanQuery);

      if (matchSym || matchNum || matchName || matchCat) {
        cell.classList.remove("dimmed");
        cell.classList.add("highlighted");
      } else {
        cell.classList.add("dimmed");
        cell.classList.remove("highlighted");
      }
    });
  }

  function initFromWidget(w) {
    currentWidget = w;
    activeCategoryFilter = null;

    const grid = w.querySelector("[data-pt-grid]");
    if (!grid) return;

    // Clear element cells if any, preserving the detail panel
    const existingCells = grid.querySelectorAll(".pt-element");
    existingCells.forEach(c => c.remove());

    // Inject 57-71 placeholder in row 6, col 3
    const laPlaceholder = document.createElement("div");
    laPlaceholder.className = "pt-element lanthanide pt-placeholder-cell";
    laPlaceholder.style.gridColumn = 3;
    laPlaceholder.style.gridRow = 6;
    laPlaceholder.setAttribute("data-placeholder-cat", "lanthanide");
    laPlaceholder.innerHTML = `
      <span class="pt-element-num">57-71</span>
      <span class="pt-element-sym">La-Lu</span>
    `;
    grid.appendChild(laPlaceholder);

    // Inject 89-103 placeholder in row 7, col 3
    const acPlaceholder = document.createElement("div");
    acPlaceholder.className = "pt-element actinide pt-placeholder-cell";
    acPlaceholder.style.gridColumn = 3;
    acPlaceholder.style.gridRow = 7;
    acPlaceholder.setAttribute("data-placeholder-cat", "actinide");
    acPlaceholder.innerHTML = `
      <span class="pt-element-num">89-103</span>
      <span class="pt-element-sym">Ac-Lr</span>
    `;
    grid.appendChild(acPlaceholder);

    // Dynamically inject elements
    ELEMENTS.forEach(el => {
      const cell = document.createElement("div");
      cell.className = `pt-element ${el.cat}`;
      cell.style.gridColumn = el.col;
      cell.style.gridRow = el.row;
      cell.setAttribute("data-num", el.num);

      cell.innerHTML = `
        <span class="pt-element-num">${el.num}</span>
        <span class="pt-element-sym">${el.sym}</span>
        <span class="pt-element-name">${el.name}</span>
        <div class="state-indicator state-${el.state}" data-state-dot></div>
      `;

      // Hover triggers detail display update
      cell.addEventListener("mouseenter", () => updateDetailDisplay(el));

      // Click opens modal details
      cell.addEventListener("click", () => showElementModal(el));

      grid.appendChild(cell);
    });

    // Select initial element based on query if present, otherwise default to Hydrogen
    let initialElement = ELEMENTS[0];
    const defaultElAttr = w.getAttribute("data-default-element");
    if (defaultElAttr) {
      const cleanAttr = defaultElAttr.trim().toLowerCase();
      const found = ELEMENTS.find(e =>
        e.name.toLowerCase() === cleanAttr ||
        e.sym.toLowerCase() === cleanAttr ||
        String(e.num) === cleanAttr
      );
      if (found) {
        initialElement = found;
      }
    }
    updateDetailDisplay(initialElement);

    // Setup Event Listeners
    const searchInput = w.querySelector("[data-pt-search]");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => searchElements(e.target.value));
    }

    const clearSearchBtn = w.querySelector("[data-pt-clear-search]");
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener("click", () => {
        if (searchInput) {
          searchInput.value = "";
          searchElements("");
        }
      });
    }

    const tempSlider = w.querySelector("[data-pt-temp-slider]");
    const tempValLabel = w.querySelector("[data-pt-temp-val]");
    if (tempSlider && tempValLabel) {
      tempSlider.addEventListener("input", (e) => {
        const temp = parseInt(e.target.value, 10);
        const celsius = Math.round(temp - 273.15);
        tempValLabel.textContent = `${temp} K (${celsius} °C)`;

        // Highlight preset button
        w.querySelectorAll(".pt-preset-btn").forEach(btn => {
          if (parseInt(btn.getAttribute("data-temp"), 10) === temp) {
            btn.classList.add("pt-preset-active");
          } else {
            btn.classList.remove("pt-preset-active");
          }
        });

        updateStatesForTemp(temp);
      });
    }

    // Preset buttons
    w.querySelectorAll(".pt-preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const temp = parseInt(btn.getAttribute("data-temp"), 10);
        if (tempSlider) {
          tempSlider.value = temp;
          // Dispatch input event to trigger slider handler
          tempSlider.dispatchEvent(new Event("input"));
        }
      });
    });

    // Filters click
    w.querySelectorAll("[data-category]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-category");
        if (activeCategoryFilter === cat) {
          filterByCategory(null);
        } else {
          filterByCategory(cat);
        }
      });
    });

    // Modal close listeners
    w.querySelectorAll("[data-pt-close-modal]").forEach(btn => {
      btn.addEventListener("click", hideModal);
    });

    // Run initial sizing and attach resize listener
    handleResize();
    window.addEventListener("resize", handleResize);
  }

  function handleResize() {
    if (!currentWidget) return;
    const width = currentWidget.getBoundingClientRect().width;
    if (width < 850) {
      currentWidget.classList.add("pt-compact");
    } else {
      currentWidget.classList.remove("pt-compact");
    }
  }

  function cleanupWidget() {
    if (currentWidget) {
      window.removeEventListener("resize", handleResize);
      currentWidget = null;
    }
  }

  function handleDocumentClick(e) {
    const w = widget();
    if (!w) {
      cleanupWidget();
      return;
    }
    if (w !== currentWidget) {
      cleanupWidget();
      initFromWidget(w);
    }
  }

  function checkWidget() {
    const w = widget();
    if (!w) {
      cleanupWidget();
      return;
    }
    if (w !== currentWidget) {
      cleanupWidget();
      initFromWidget(w);
    }
  }

  // Bind events
  document.addEventListener("click", handleDocumentClick);

  // MutationObserver triggers when the search results page renders the plugin slot
  const observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
