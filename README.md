# 5 METRI Profilu studija

Publisks, telefonam pielāgots alumīnija profilu konfiguratora prototips.

## Iespējas

- L, U, O un taisnstūra caurules profili ar maināmu platumu, augstumu, sienas biezumu un garumu;
- brīvi zīmējams X/Y šķērsgriezums uz 1 mm režģa;
- periodisku urbumu specifikācija gar Z asi;
- īsta mēroga WebGL 3D modelis ar ekstrūzijas animāciju;
- šķērsgriezuma laukuma un teorētiskās masas aprēķins;
- ierīcē saglabājami melnraksti un kopīgojama dizaina saite;
- lejupielādējama JSON ražošanas specifikācija un sagatavots RFQ e-pasts.

> Šis ir koncepta konfigurators. Gala tolerances, apstrādi un ražojamību pirms pasūtījuma apstiprina tehnologs.

## Lokāla palaišana

```powershell
python -m http.server 8772 --bind 127.0.0.1
```

Pēc tam atver `http://127.0.0.1:8772`.

## Tehnoloģijas

Projekts ir statisks HTML/CSS/JavaScript un izmanto Three.js 3D attēlošanai. Tam nav nepieciešams būvēšanas solis vai servera datubāze.

