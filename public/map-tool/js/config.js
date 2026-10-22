/**
 * Pillars of Creation Maps - Configuration
 * Colors, data sources, examples, and settings
 */

const CONFIG = {
    // Map styles
    styles: {
        liberty: 'https://tiles.openfreemap.org/styles/liberty',
        satellite: 'nasa-satellite'
    },

    // Color palette — 12 color-theory-based colors, evenly spaced on the hue wheel
    colors: {
        red: '#dc2626',
        orange: '#ea580c',
        yellow: '#ca8a04',
        green: '#16a34a',
        teal: '#0d9488',
        blue: '#2563eb',
        indigo: '#4f46e5',
        purple: '#9333ea',
        pink: '#db2777',
        brown: '#92400e',
        gray: '#6b7280',
        white: '#e5e7eb'
    },

    // Data sources
    data: {
        countries: './data/countries.geojson',
        regions: './data/regions.geojson',
        // Fallback URLs if local files don't exist
        countriesFallback: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson',
        regionsFallback: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
    },

    // Country name aliases for easier searching
    aliases: {
        usa: 'united states of america',
        us: 'united states of america',
        america: 'united states of america',
        uk: 'united kingdom',
        britain: 'united kingdom',
        england: 'united kingdom',
        uae: 'united arab emirates',
        czech: 'czechia',
        russia: 'russian federation',
        holland: 'netherlands',
        gaza: 'palestine',
        'west bank': 'palestine',
        'palestinian territories': 'palestine',
        'macedonia': 'north macedonia',
        'bosnia': 'bosnia and herz.',
        'bosnia and herzegovina': 'bosnia and herz.'
    },

    // Region name aliases (for special characters and alternate spellings)
    regionAliases: {
        // Azerbaijani regions - Karabakh conflict zones
        // The 7 surrounding occupied districts:
        'lachin': ['lacin', 'laçın', 'lachin'],
        'kalbajar': ['kalbacar', 'kəlbəcər', 'kalbajar'],
        'agdam': ['ağdam', 'agdam'],
        'fuzuli': ['füzuli', 'fuzuli'],
        'jabrayil': ['cabrayil', 'cəbrayıl', 'jabrayil'],
        'zangilan': ['zəngilan', 'zangilan'],
        'qubadli': ['qubadli', 'qubadlı'],
        // Nagorno-Karabakh proper (the autonomous region):
        'nagornokarabakh': ['nagorno-karabakh', 'nagorno karabakh', 'artsakh'],
        'shusha': ['şuşa', 'shusha', 'shushi'],
        'khojaly': ['xocalı', 'khojaly', 'xocali'],
        'khojavend': ['xocavənd', 'khojavend', 'martuni'],
        'hadrut': ['hadrut'],
        'askeran': ['əsgəran', 'askeran'],
        // Other regions:
        'lankaran': ['lənkəran', 'lankaran', 'lenkeran'],

        // Ukrainian oblasts (Natural Earth uses Ukrainian transliterations)
        'donetsk': ["donets'ka", 'donetska', 'donetsk', 'donetzka'],
        'luhansk': ["luhans'ka", 'luhanska', 'luhansk', 'lugansk'],
        'zaporizhzhia': ["zaporiz'ka", 'zaporizka', 'zaporizhzhia', 'zaporizhia', 'zaporiz ka'],
        'zaporizhia': ["zaporiz'ka", 'zaporizka', 'zaporizhzhia', 'zaporizhia'],
        'kherson': ["khersons'ka", 'khersonska', 'kherson'],
        'kharkiv': ["kharkivs'ka", 'kharkivska', 'kharkiv'],
        'crimea': ['krym', 'crimea', 'respublika krym', 'ar krym', 'avtonomna respublika krym', 'autonomous republic of crimea'],

        // Bosnian entities
        'republika srpska': ['republika srpska', 'republic of srpska'],

        // German states (English names → German Natural Earth names)
        'bavaria': ['bayern', 'bavaria'],
        'hesse': ['hessen', 'hesse'],
        'lower saxony': ['niedersachsen', 'lower saxony'],
        'north rhine westphalia': ['nordrhein westfalen', 'north rhine westphalia'],
        'rhineland palatinate': ['rheinland pfalz', 'rhineland palatinate'],
        'thuringia': ['thüringen', 'thuringen', 'thuringia'],
        'saxony': ['sachsen', 'saxony'],
        'saxony anhalt': ['sachsen anhalt', 'saxony anhalt']
    },

    // Satellite imagery settings
    satellite: {
        tiles: 'https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
        maxZoom: 8
    }
};