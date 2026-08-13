# 5 METRI Profilu studija

Publisks, telefonam pielāgots alumīnija profilu konfiguratora prototips.

## Iespējas

- L un U veida profili, apaļā caurule, pilns kastes profils un taisnstūra caurule ar maināmu platumu, augstumu, sienas biezumu un garumu;
- brīvi zīmējams X/Y šķērsgriezums uz 250 × 250 mm laukuma: katrs punkts atrodas tuvākajā 1 mm režģa krustpunktā, un ir atļautas slīpas malas;
- periodisku un atsevišķu urbumu specifikācija gar Z asi;
- viens pilna garuma WebGL 3D profils abos skatos, ar rotāciju, pārbīdi, pietuvināšanu un fokusu uz profila galu;
- ekstrūzijas preses skats un ražošanas animācija, kas animē to pašu pilna garuma modeli;
- šķērsgriezuma laukuma un teorētiskās masas aprēķins;
- ierīcē saglabājami melnraksti un kopīgojama dizaina saite;
- lejupielādējama JSON ražošanas specifikācija un tiešs RFQ pieprasījums uz `abb@5metri.lv` ar e-pasta rezerves variantu.

> Šis ir koncepta konfigurators. Gala tolerances, apstrādi un ražojamību pirms pasūtījuma apstiprina tehnologs.

## RFQ aktivizēšana

Statiskais GitHub Pages risinājums izmanto FormSubmit AJAX piegādi. Pēc pirmā reālā pieprasījuma `abb@5metri.lv` saņems vienreizēju aktivizācijas e-pastu; tajā esošā saite ir jāapstiprina. Līdz apstiprināšanai FormSubmit pieprasījumus saglabā, bet nepārsūta uz pastkasti.

## Lokāla palaišana

```powershell
python -m http.server 8772 --bind 127.0.0.1
```

Pēc tam atver `http://127.0.0.1:8772`.

## Tehnoloģijas

Projekts ir statisks HTML/CSS/JavaScript un izmanto Three.js 3D attēlošanai. Tam nav nepieciešams būvēšanas solis vai servera datubāze.
