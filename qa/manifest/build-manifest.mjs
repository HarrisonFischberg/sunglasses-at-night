// Source for qa/manifest/sites.json (run: node qa/manifest/build-manifest.mjs).
// One row per DISTINCT registrable domain. Columns:
//   domain | deep URL tested (a representative inner page where one is public) |
//   category | features | interactions | expected invariants (beyond the defaults) | access
// Default invariants for every site: no unintended white flash on startup; reading
// surfaces dark; photos/brand media unchanged (no black, grey, dim or inverted);
// text and controls readable (WCAG 4.5:1 body, 3:1 large/UI); links/buttons still
// work; turning dark mode off restores the page with no residue.
// access: open | consent (cookie wall likely) | paywall (metered) | login (some content) | geo
import { writeFileSync } from 'node:fs';

const rows = `
amazon.com | https://www.amazon.com/ | ecommerce | heavy,late-css,multiply-blend,carousel,sticky-header | scroll,new-tab | product photos keep color; no white pop-in (owner report) | open
wikipedia.org | https://en.wikipedia.org/wiki/Solar_eclipse | reference | tables,infobox,svg,images,native-dark-optional | scroll | infobox and tables dark, diagrams legible | open
github.com | https://github.com/microsoft/vscode | dev-tools | system-theme-aware,code,svg-icons,sticky | scroll | native dark respected (not double-darkened) | open
nytimes.com | https://www.nytimes.com/section/science | news | photos,ads,sticky-header,consent | scroll | article photos unchanged | paywall
quiettownhome.com | https://quiettownhome.com/collections/all | ecommerce-shopify | rgb-triplet-vars,product-grid,lazy-images | scroll | Shopify triplet colors converted; product photos unchanged (owner report) | open
developer.mozilla.org | https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme | docs | system-theme-aware,code,tables | scroll | native dark respected; code blocks readable | open
reddit.com | https://www.reddit.com/r/AskHistorians/ | forum | spa,infinite-scroll,shadow-dom,web-components | scroll | feed dark, votes/icons visible | consent
youtube.com | https://www.youtube.com/@NASA | video | native-dark,thumbnails,spa | scroll | thumbnails unchanged | consent
allrecipes.com | https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/ | recipes | photos,ads,overlays,long-article | scroll | food photos unchanged | consent
openstreetmap.org | https://www.openstreetmap.org/#map=12/51.5074/-0.1278 | maps | map-tiles,canvas,controls | none | map tiles keep their colors | open
amazon-fresh | https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo | ecommerce-grocery | lazy-images,multiply-tint,grid | scroll | product photos never black (owner report) | geo
bbc.com | https://www.bbc.com/news/science_and_environment | news | photos,consent | scroll | | consent
theguardian.com | https://www.theguardian.com/science | news | photos,brand-colors,native-dark-optional | scroll | section colors kept useful | consent
apnews.com | https://apnews.com/hub/science | news | photos,ads | scroll | | open
npr.org | https://www.npr.org/sections/science/ | news | photos,audio-player | scroll | | open
reuters.com | https://www.reuters.com/science/ | news | photos,spa | scroll | | consent
arstechnica.com | https://arstechnica.com/science/ | news | photos,native-dark-optional | scroll | | open
theverge.com | https://www.theverge.com/tech | news | bold-colors,photos,spa | scroll | brand accent kept | open
wired.com | https://www.wired.com/category/science/ | news | photos,paywall | scroll | | paywall
cnn.com | https://edition.cnn.com/world | news | video,photos,ads,heavy | scroll | | consent
washingtonpost.com | https://www.washingtonpost.com/technology/ | news | photos,paywall | scroll | | paywall
aljazeera.com | https://www.aljazeera.com/news/ | news | photos | scroll | | open
economist.com | https://www.economist.com/science-and-technology | news | photos,paywall,brand-red | scroll | brand red kept | paywall
nature.com | https://www.nature.com/news | science | photos,figures | scroll | figures keep colors | open
scientificamerican.com | https://www.scientificamerican.com/space/ | science | photos | scroll | | paywall
nasa.gov | https://science.nasa.gov/mars/ | science | photos,dark-hero | scroll | space photos unchanged | open
britannica.com | https://www.britannica.com/science/photosynthesis | reference | images,diagrams,ads | scroll | | open
merriam-webster.com | https://www.merriam-webster.com/dictionary/serendipity | reference | ads,forms | type-search | | open
wiktionary.org | https://en.wiktionary.org/wiki/dark | reference | tables | scroll | | open
archive.org | https://archive.org/details/texts | reference | grid,images,spa | scroll | | open
stackoverflow.com | https://stackoverflow.com/questions/tagged/css | forum | system-theme-aware,code,tags | scroll | tags and votes legible | consent
news.ycombinator.com | https://news.ycombinator.com/ | forum | tables,orange-brand,light-only | none | orange header kept | open
medium.com | https://medium.com/tag/design | blog | photos,spa,overlays | scroll | | login
substack.com | https://substack.com/discover | blog | spa,photos | scroll | | open
wordpress.org | https://wordpress.org/news/ | blog | photos | scroll | | open
docs.python.org | https://docs.python.org/3/library/functools.html | docs | code,system-theme-aware | scroll | code highlighting readable | open
nodejs.org | https://nodejs.org/en/learn/getting-started/introduction-to-nodejs | docs | code,native-dark-optional | scroll | | open
react.dev | https://react.dev/learn | docs | system-theme-aware,code,illustrations | scroll | | open
tailwindcss.com | https://tailwindcss.com/docs/installation | docs | system-theme-aware,code | scroll | | open
apple.com | https://www.apple.com/iphone/ | brand | photos,dark-sections,video,sticky-nav | scroll | product photos unchanged; dark sections untouched | open
developer.apple.com | https://developer.apple.com/documentation/safariservices/safari-web-extensions | docs | system-theme-aware,code | scroll | | open
etsy.com | https://www.etsy.com/c/home-and-living | ecommerce | product-grid,photos,consent | scroll | | consent
ebay.com | https://www.ebay.com/b/Cameras-Photo/625/bn_1865546 | ecommerce | product-grid,photos | scroll | | open
target.com | https://www.target.com/c/kitchen-dining/-/N-hz89j | ecommerce | product-grid,red-brand | scroll | red brand kept | open
ikea.com | https://www.ikea.com/us/en/cat/chairs-fu002/ | ecommerce | product-grid,photos-on-white,transparent-png | scroll | product cutouts unchanged | consent
bestbuy.com | https://www.bestbuy.com/site/electronics/headphones/abcat0204000.c?id=abcat0204000 | ecommerce | product-grid,overlays | scroll | | geo
booking.com | https://www.booking.com/city/fr/paris.html | travel | photos,forms,datepicker | scroll | form fields readable | consent
airbnb.com | https://www.airbnb.com/s/Lisbon/homes | travel | photos,map,spa,overlays | scroll | listing photos unchanged | consent
tripadvisor.com | https://www.tripadvisor.com/Tourism-g187147-Paris_Ile_de_France-Vacations.html | travel | photos,consent | scroll | | consent
lonelyplanet.com | https://www.lonelyplanet.com/japan | travel | photos,hero | scroll | | open
seriouseats.com | https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe | recipes | photos,long-article,ads | scroll | | open
bonappetit.com | https://www.bonappetit.com/recipes | recipes | photos | scroll | | consent
investopedia.com | https://www.investopedia.com/terms/c/compoundinterest.asp | finance | formulas,tables,ads | scroll | | open
nerdwallet.com | https://www.nerdwallet.com/article/investing/what-is-an-index-fund | finance | tables,cards,charts | scroll | chart colors kept | open
finance.yahoo.com | https://finance.yahoo.com/markets/ | finance | charts,tables,red-green | scroll | red/green meaning kept | consent
coinmarketcap.com | https://coinmarketcap.com/ | finance | tables,sparklines,red-green,native-dark-optional | scroll | sparklines keep red/green | open
weather.gov | https://forecast.weather.gov/MapClick.php?lat=40.7128&lon=-74.006 | weather | tables,icons,light-only | scroll | weather icons unchanged | open
weather.com | https://weather.com/weather/today/l/40.71,-74.01 | weather | ads,heavy,video | scroll | | consent
imdb.com | https://www.imdb.com/chart/top/ | entertainment | native-dark,posters | scroll | | open
rottentomatoes.com | https://www.rottentomatoes.com/browse/movies_in_theaters/ | entertainment | posters,grid | scroll | | open
spotify.com | https://open.spotify.com/genre/0JQ5DAqbMKFEC4WFtoNRpw | music | native-dark,spa | none | already dark: untouched | open
soundcloud.com | https://soundcloud.com/discover | music | spa,images,waveforms | scroll | | consent
bandcamp.com | https://bandcamp.com/discover | music | album-art,grid | scroll | album art unchanged | open
flickr.com | https://www.flickr.com/explore | photos | photo-grid,native-dark-optional | scroll | photos unchanged | open
unsplash.com | https://unsplash.com/t/nature | photos | photo-grid,masonry,infinite-scroll | scroll | photos unchanged | open
behance.net | https://www.behance.net/galleries/graphic-design | portfolio | image-grid | scroll | | open
dribbble.com | https://dribbble.com/shots/popular | portfolio | image-grid,overlays | scroll | shot images unchanged | open
500px.com | https://500px.com/popular | photos | photo-grid,spa | scroll | | open
instagram.com | https://www.instagram.com/nasa/ | social | photos,login-wall | scroll | | login
x.com | https://x.com/NASA | social | spa,login-wall | scroll | | login
linkedin.com | https://www.linkedin.com/company/nasa/ | social | login-wall | scroll | | login
tumblr.com | https://www.tumblr.com/explore/trending | social | images,spa | scroll | | consent
pinterest.com | https://www.pinterest.com/ideas/ | social | masonry,images | scroll | | login
mastodon.social | https://mastodon.social/explore | social | spa,native-dark | scroll | | open
bsky.app | https://bsky.app/profile/bsky.app | social | spa,system-theme-aware | scroll | | open
twitch.tv | https://www.twitch.tv/directory | video | native-dark,thumbnails | scroll | | open
vimeo.com | https://vimeo.com/watch | video | thumbnails,video | scroll | | open
ted.com | https://www.ted.com/talks | video | thumbnails,red-brand | scroll | | open
khanacademy.org | https://www.khanacademy.org/math/algebra | education | illustrations,svg | scroll | | open
coursera.org | https://www.coursera.org/browse/data-science | education | cards,images | scroll | | open
mit.edu | https://www.mit.edu/ | education | photos,brand | scroll | | open
harvard.edu | https://www.harvard.edu/ | education | photos,crimson-brand | scroll | | open
stanford.edu | https://www.stanford.edu/ | education | photos,cardinal-brand | scroll | | open
w3.org | https://www.w3.org/WAI/standards-guidelines/wcag/ | standards | text,tables | scroll | | open
webkit.org | https://webkit.org/blog/ | docs | code,photos | scroll | | open
mozilla.org | https://www.mozilla.org/en-US/firefox/ | brand | illustrations,gradients | scroll | gradients keep hue | open
gnu.org | https://www.gnu.org/philosophy/free-sw.html | text | light-only,server-rendered | none | | open
craigslist.org | https://newyork.craigslist.org/search/sss | classifieds | lists,light-only | scroll | | open
zillow.com | https://www.zillow.com/new-york-ny/ | real-estate | map,photos,spa | scroll | map and photos unchanged | geo
realtor.com | https://www.realtor.com/realestateandhomes-search/Austin_TX | real-estate | photos,map | scroll | | geo
yelp.com | https://www.yelp.com/search?find_desc=Coffee&find_loc=San+Francisco%2C+CA | local | photos,map,ratings | scroll | rating stars keep color | consent
craftsy.com | https://www.craftsy.com/ | hobby | photos | scroll | | open
goodreads.com | https://www.goodreads.com/genres/science-fiction | books | covers | scroll | | open
gutenberg.org | https://www.gutenberg.org/ebooks/1342 | books | light-only,tables | scroll | | open
arxiv.org | https://arxiv.org/list/cs.CV/recent | science | light-only,text | scroll | | open
pubmed.ncbi.nlm.nih.gov | https://pubmed.ncbi.nlm.nih.gov/?term=circadian+rhythm | science | lists,forms | scroll | | open
cdc.gov | https://www.cdc.gov/sleep/about/index.html | health | text,images | scroll | | open
mayoclinic.org | https://www.mayoclinic.org/healthy-lifestyle/adult-health/in-depth/sleep/art-20048379 | health | text,ads | scroll | | open
webmd.com | https://www.webmd.com/sleep-disorders/default.htm | health | ads,images | scroll | | consent
usa.gov | https://www.usa.gov/ | government | forms,light-only | scroll | | open
gov.uk | https://www.gov.uk/browse/driving | government | light-only,lists,accessibility-first | scroll | focus styles kept visible | open
irs.gov | https://www.irs.gov/forms-instructions | government | tables,forms | scroll | | open
europa.eu | https://european-union.europa.eu/index_en | government | photos | scroll | | consent
un.org | https://www.un.org/en/ | government | photos,blue-brand | scroll | | open
who.int | https://www.who.int/news-room/fact-sheets | health | lists | scroll | | open
nationalgeographic.com | https://www.nationalgeographic.com/animals | magazine | photos,yellow-brand | scroll | photos unchanged | consent
smithsonianmag.com | https://www.smithsonianmag.com/science-nature/ | magazine | photos | scroll | | open
newyorker.com | https://www.newyorker.com/culture | magazine | illustrations,paywall | scroll | illustrations unchanged | paywall
theatlantic.com | https://www.theatlantic.com/technology/ | magazine | photos,paywall | scroll | | paywall
vox.com | https://www.vox.com/technology | news | bold-colors | scroll | | open
axios.com | https://www.axios.com/technology | news | text | scroll | | open
politico.com | https://www.politico.com/ | news | photos | scroll | | open
bloomberg.com | https://www.bloomberg.com/technology | news | charts,paywall | scroll | | paywall
ft.com | https://www.ft.com/technology | news | salmon-brand,paywall | scroll | salmon background treated as surface | paywall
wsj.com | https://www.wsj.com/tech | news | photos,paywall | scroll | | paywall
usatoday.com | https://www.usatoday.com/tech/ | news | photos,ads | scroll | | consent
latimes.com | https://www.latimes.com/science | news | photos,paywall | scroll | | paywall
techcrunch.com | https://techcrunch.com/category/startups/ | news | photos,green-brand | scroll | | open
engadget.com | https://www.engadget.com/ | news | photos | scroll | | consent
cnet.com | https://www.cnet.com/tech/ | news | photos,ads | scroll | | open
zdnet.com | https://www.zdnet.com/topic/artificial-intelligence/ | news | photos | scroll | | open
macrumors.com | https://www.macrumors.com/ | news | photos,native-dark-optional | scroll | | open
9to5mac.com | https://9to5mac.com/ | news | photos | scroll | | open
daringfireball.net | https://daringfireball.net/ | blog | light-only,text | scroll | | open
kottke.org | https://kottke.org/ | blog | text,images | scroll | | open
smashingmagazine.com | https://www.smashingmagazine.com/articles/ | blog | illustrations,code | scroll | | open
css-tricks.com | https://css-tricks.com/guides/ | blog | code,native-dark | scroll | | open
dev.to | https://dev.to/t/css | forum | system-theme-aware,code | scroll | | open
gitlab.com | https://gitlab.com/gitlab-org/gitlab | dev-tools | system-theme-aware,code | scroll | | open
bitbucket.org | https://bitbucket.org/product/ | dev-tools | illustrations | scroll | | open
npmjs.com | https://www.npmjs.com/package/playwright | dev-tools | code,tables | scroll | | open
pypi.org | https://pypi.org/project/requests/ | dev-tools | code,blue-brand | scroll | | open
crates.io | https://crates.io/crates/serde | dev-tools | spa,code | scroll | | open
rust-lang.org | https://www.rust-lang.org/learn | docs | code | scroll | | open
go.dev | https://go.dev/doc/ | docs | system-theme-aware,code | scroll | | open
kotlinlang.org | https://kotlinlang.org/docs/home.html | docs | code,spa | scroll | | open
swift.org | https://www.swift.org/documentation/ | docs | code,system-theme-aware | scroll | | open
docker.com | https://www.docker.com/products/docker-desktop/ | brand | illustrations,gradients | scroll | | consent
kubernetes.io | https://kubernetes.io/docs/concepts/overview/ | docs | code,diagrams | scroll | diagrams legible | open
aws.amazon.com | https://aws.amazon.com/s3/ | brand | illustrations,dark-sections | scroll | | consent
cloud.google.com | https://cloud.google.com/storage | brand | illustrations | scroll | | consent
azure.microsoft.com | https://azure.microsoft.com/en-us/products/storage/blobs | brand | illustrations | scroll | | consent
microsoft.com | https://www.microsoft.com/en-us/microsoft-365 | brand | photos,gradients | scroll | | consent
google.com | https://www.google.com/search?q=dark+mode+safari | search | system-theme-aware,forms,serp | type-search | results readable | consent
bing.com | https://www.bing.com/search?q=dark+mode+safari | search | system-theme-aware,serp | none | | consent
duckduckgo.com | https://duckduckgo.com/?q=dark+mode+safari | search | system-theme-aware,serp | none | | open
startpage.com | https://www.startpage.com/ | search | forms | type-search | | open
ecosia.org | https://www.ecosia.org/ | search | forms,illustrations | type-search | | open
notion.so | https://www.notion.so/product | saas | illustrations,video | scroll | | consent
figma.com | https://www.figma.com/community | saas | thumbnails,spa | scroll | | consent
canva.com | https://www.canva.com/templates/ | saas | thumbnails | scroll | | consent
trello.com | https://trello.com/templates | saas | illustrations,cards | scroll | | consent
asana.com | https://asana.com/templates | saas | illustrations | scroll | | consent
slack.com | https://slack.com/features | saas | illustrations,brand-purple | scroll | | consent
zoom.us | https://zoom.us/ | saas | photos | scroll | | consent
dropbox.com | https://www.dropbox.com/features | saas | illustrations | scroll | | consent
stripe.com | https://stripe.com/payments | saas | gradients,animated-canvas | scroll | gradient hero keeps hue | open
shopify.com | https://www.shopify.com/pos | saas | photos,green-brand | scroll | | consent
squarespace.com | https://www.squarespace.com/templates | saas | thumbnails | scroll | | consent
wix.com | https://www.wix.com/website/templates | saas | thumbnails | scroll | | consent
mailchimp.com | https://mailchimp.com/features/ | saas | illustrations,yellow-brand | scroll | | consent
hubspot.com | https://www.hubspot.com/products/crm | saas | illustrations | scroll | | consent
atlassian.com | https://www.atlassian.com/software/jira | saas | illustrations | scroll | | consent
codepen.io | https://codepen.io/trending | dev-tools | native-dark,iframes | scroll | | open
jsfiddle.net | https://jsfiddle.net/ | dev-tools | editor,iframes | none | | open
observablehq.com | https://observablehq.com/@d3/gallery | dashboards | charts,svg,canvas | scroll | chart colors kept | open
ourworldindata.org | https://ourworldindata.org/co2-emissions | dashboards | charts,svg,maps | scroll | chart and map colors kept | open
data.gov | https://data.gov/ | dashboards | tables,forms | scroll | | open
tradingeconomics.com | https://tradingeconomics.com/united-states/gdp-growth | dashboards | charts,tables | scroll | | open
statista.com | https://www.statista.com/markets/ | dashboards | charts,paywall | scroll | | paywall
grafana.com | https://play.grafana.org/ | dashboards | native-dark,charts,canvas | none | already dark: untouched | open
speedtest.net | https://www.speedtest.net/ | tools | native-dark,canvas | none | | consent
timeanddate.com | https://www.timeanddate.com/worldclock/ | tools | tables,maps | scroll | | consent
wolframalpha.com | https://www.wolframalpha.com/input?i=sunset+times+london | tools | forms,images-of-math | none | result images legible | open
translate.google.com | https://translate.google.com/?sl=en&tl=fr&text=sunglasses | tools | forms,textarea | none | textarea readable | consent
calculator.net | https://www.calculator.net/bmi-calculator.html | tools | forms,tables,select | none | form controls readable | open
typeform.com | https://www.typeform.com/templates/ | forms | illustrations,forms | scroll | | consent
surveymonkey.com | https://www.surveymonkey.com/mp/sample-size-calculator/ | forms | forms,inputs | none | inputs readable | consent
jotform.com | https://www.jotform.com/form-templates/ | forms | thumbnails,forms | scroll | | consent
eventbrite.com | https://www.eventbrite.com/d/ny--new-york/events/ | events | photos,cards | scroll | | consent
meetup.com | https://www.meetup.com/find/?keywords=photography | events | photos,spa | scroll | | consent
ticketmaster.com | https://www.ticketmaster.com/discover/concerts | events | photos,blue-brand | scroll | | consent
espn.com | https://www.espn.com/nba/standings | sports | tables,logos,heavy | scroll | team logos unchanged | open
nba.com | https://www.nba.com/standings | sports | tables,logos | scroll | | consent
fifa.com | https://www.fifa.com/en | sports | photos,spa | scroll | | consent
strava.com | https://www.strava.com/features | sports | photos,maps | scroll | | consent
nike.com | https://www.nike.com/w/mens-shoes-nik1zy7ok | ecommerce | product-grid,photos-on-grey | scroll | product photos unchanged | consent
adidas.com | https://www.adidas.com/us/men-shoes | ecommerce | product-grid | scroll | | geo
zara.com | https://www.zara.com/us/en/woman-new-in-l1180.html | ecommerce | photos,minimal | scroll | | consent
uniqlo.com | https://www.uniqlo.com/us/en/men/tops | ecommerce | product-grid | scroll | | consent
hm.com | https://www2.hm.com/en_us/men/new-arrivals/view-all.html | ecommerce | product-grid | scroll | | consent
walmart.com | https://www.walmart.com/browse/home/kitchen-dining/4044_623679 | ecommerce | product-grid,blue-yellow-brand | scroll | | open
costco.com | https://www.costco.com/televisions.html | ecommerce | product-grid | scroll | | open
homedepot.com | https://www.homedepot.com/b/Tools/N-5yc1vZc1xy | ecommerce | product-grid,orange-brand | scroll | | geo
lowes.com | https://www.lowes.com/c/Tools | ecommerce | product-grid | scroll | | geo
wayfair.com | https://www.wayfair.com/furniture/cat/furniture-c45974.html | ecommerce | product-grid,photos | scroll | | consent
newegg.com | https://www.newegg.com/GPUs-Video-Graphics-Cards/SubCategory/ID-48 | ecommerce | product-grid,tables | scroll | | open
bhphotovideo.com | https://www.bhphotovideo.com/c/buy/mirrorless-cameras/ci/16158 | ecommerce | product-grid | scroll | | open
rei.com | https://www.rei.com/c/tents | ecommerce | product-grid,green-brand | scroll | | open
patagonia.com | https://www.patagonia.com/shop/mens | ecommerce | photos | scroll | | consent
allbirds.com | https://www.allbirds.com/collections/mens | ecommerce-shopify | rgb-triplet-vars,product-grid | scroll | Shopify colors converted | open
gymshark.com | https://www.gymshark.com/collections/all-products | ecommerce-shopify | product-grid,spa | scroll | | consent
kyliecosmetics.com | https://kyliecosmetics.com/collections/all | ecommerce-shopify | product-grid | scroll | | consent
deathwishcoffee.com | https://www.deathwishcoffee.com/collections/coffee | ecommerce-shopify | dark-brand,product-grid | scroll | | open
brooklinen.com | https://www.brooklinen.com/collections/sheets | ecommerce-shopify | photos | scroll | | consent
bombas.com | https://bombas.com/collections/mens-socks | ecommerce-shopify | product-grid | scroll | | consent
fashionnova.com | https://www.fashionnova.com/collections/new-in | ecommerce-shopify | product-grid | scroll | | consent
taylorstitch.com | https://www.taylorstitch.com/collections/mens-shirts | ecommerce-shopify | photos | scroll | | open
ruggable.com | https://ruggable.com/collections/all-rugs | ecommerce-shopify | product-grid,patterns | scroll | rug patterns unchanged | consent
partakefoods.com | https://www.partakefoods.com/collections/all | ecommerce-shopify | illustrations,bright-brand | scroll | | open
united.com | https://www.united.com/en/us | travel | forms,datepicker,photos | none | form controls readable | consent
delta.com | https://www.delta.com/ | travel | forms,photos | none | | consent
expedia.com | https://www.expedia.com/Hotel-Search?destination=Rome | travel | photos,forms | scroll | | consent
kayak.com | https://www.kayak.com/explore | travel | map,forms | none | | consent
hotels.com | https://www.hotels.com/de1636426/hotels-london/ | travel | photos | scroll | | consent
rome2rio.com | https://www.rome2rio.com/ | travel | forms,map | none | | open
amtrak.com | https://www.amtrak.com/home.html | travel | forms,photos | none | | consent
nps.gov | https://www.nps.gov/yose/index.htm | travel | photos,brown-brand | scroll | | open
food52.com | https://food52.com/recipes | recipes | photos,grid | scroll | | open
epicurious.com | https://www.epicurious.com/recipes-menus | recipes | photos | scroll | | consent
kingarthurbaking.com | https://www.kingarthurbaking.com/recipes/chocolate-chip-cookies-recipe | recipes | photos,long-article | scroll | | open
budgetbytes.com | https://www.budgetbytes.com/category/recipes/ | recipes | photos,grid | scroll | | open
smittenkitchen.com | https://smittenkitchen.com/recipes/ | recipes | photos,light-only | scroll | | open
cookieandkate.com | https://cookieandkate.com/recipes/ | recipes | photos,grid | scroll | | open
thekitchn.com | https://www.thekitchn.com/collection/recipes | recipes | photos | scroll | | consent
fool.com | https://www.fool.com/investing/stock-market/ | finance | text,charts | scroll | | open
morningstar.com | https://www.morningstar.com/markets | finance | tables,charts | scroll | | open
bankrate.com | https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/ | finance | tables,forms | scroll | | open
federalreserve.gov | https://www.federalreserve.gov/monetarypolicy.htm | finance | text,light-only | scroll | | open
sec.gov | https://www.sec.gov/edgar/search/ | finance | forms,spa | none | | open
xe.com | https://www.xe.com/currencyconverter/ | finance | forms,charts | none | | consent
`;

const SETS = {
  pilot: ['amazon.com', 'wikipedia.org', 'github.com', 'nytimes.com', 'quiettownhome.com', 'developer.mozilla.org', 'reddit.com', 'youtube.com', 'allrecipes.com', 'openstreetmap.org'],
};

const sites = rows.trim().split('\n').map((line, i) => {
  const [domain, url, category, features, interactions, invariants, access] = line.split('|').map((s) => s.trim());
  return {
    id: domain, domain, url, category,
    features: features ? features.split(',') : [],
    interactions: interactions && interactions !== 'none' ? interactions.split(',') : [],
    invariants: invariants ? [invariants] : [],
    access: access || 'open',
    scrolls: interactions === 'none' ? 0 : 2,
    order: i,
  };
});
const ids = new Set();
for (const s of sites) { if (ids.has(s.id)) throw new Error(`duplicate ${s.id}`); ids.add(s.id); }
// p50: pilot first, then the earliest rows (the list is ordered for category spread).
const p50 = [...SETS.pilot, ...sites.map((s) => s.id).filter((id) => !SETS.pilot.includes(id))].slice(0, 50);
writeFileSync(new URL('./sites.json', import.meta.url), JSON.stringify({
  version: 1,
  note: 'Shared live-site manifest for macOS Safari and iOS Simulator runs. Generated by build-manifest.mjs. amazon-fresh is a deeper amazon.com page (Amazon Fresh storefront), not a separate domain: it does not count toward the distinct-domain total.',
  defaults: { invariants: ['no unintended white flash', 'reading surfaces dark', 'photos and brand media unchanged', 'text and controls readable', 'links and controls work', 'off restores with no residue'] },
  sets: { pilot: SETS.pilot, p50 },
  sites,
}, null, 1) + '\n');
console.log(`${sites.length} rows, ${new Set(sites.map((s) => (s.id === 'amazon-fresh' ? 'amazon.com' : s.domain))).size} distinct domains`);
