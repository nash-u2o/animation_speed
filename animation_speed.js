$(function(){
  const map = new ol.Map({
    view: new ol.View({
        center: [0, 0],
        zoom: 1,
    }),
    layers: [
      new ol.layer.Tile({
        source: new ol.source.OSM(),
      }),
    ],
    target: 'map',
  });


  const style = new ol.style.Style({
    image: new ol.style.Circle({
      fill: new ol.style.Fill({
        color: 'rgba(142, 141, 143,0.4)'
     }),
      stroke: new ol.style.Stroke({
        color: '#3f3e40',
        width: 3
     }),
      radius: 5,
      width: 5,
    }),
    fill: new ol.style.Fill({
      color: 'rgba(142, 141, 143,0.4)'
   }),
    stroke: new ol.style.Stroke({
      color: '#3f3e40',
      width: 9
   })
  });

  const style2 = new ol.style.Style({
    image: new ol.style.Icon({
      anchor: [.28, 1],
      src:  "https://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png",
    })
  })

  map.getViewport().addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  
  map.getViewport().addEventListener('drop', (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    for (let i = 0; i < files.length; ++i) {
      // Get the files and slice the extension out of the filename
      const file = files.item(i);
      const fileName = file.name;
      const extension = fileName.slice(fileName.lastIndexOf(".") + 1);

      switch (extension){
        case "geojson":
          var reader = new FileReader();
          reader.onload = (e) => {
            //Load the features from the geojson
            const geojsonData = JSON.parse(e.target.result);
            const features = new ol.format.GeoJSON().readFeatures(geojsonData);
            
            //Sort every array by number order using a bubble sort
            for(let i = 0; i < features.length - 1; i++){
              for(let j = 0; j < features.length - 1 - i; j++){
                if(features[j].get("number") > features[j+1].get("number")){
                  let temp = features[j];
                  features[j] = features[j+1];
                  features[j+1] = temp;
                }
              }
            }

            //Circle
            const marker = new ol.geom.Point([]);

            //Icon
            const iconMarker = new ol.Feature({
              geometry: new ol.geom.Point([])
            });

            iconMarker.setStyle(style2);

            //Create source to hold iconMarker and the features
            const vectorSource = new ol.source.Vector({
              features: features,
            });
            vectorSource.addFeature(iconMarker);

            //Set the updateWhile attributes to true so when other things are happening the feature will still animate
            const vectorLayer = new ol.layer.Vector({
                source: vectorSource,
                updateWhileInteracting: true, 
                updateWhileAnimating: true,
            });
            map.addLayer(vectorLayer);

            //set postrender function
            vectorLayer.on("postrender", moveFeature);

            //Do some line preprocessing
            const lineDict = {};
            for(let i = 0; i < features.length; i++){
              //Get speed_values array and the linestrings for each segment
              const line = features[i].getGeometry();
              const speed = features[i].get("speed");
              const number = features[i].get("number");
              lineDict[i] = {
                "line": line,
                "speed": speed,
                "number": number
              };
            }

            //Create counter variable to track line
            let i = 0
            let startTime = Date.now();

            //Start the animation
            map.render();

            function moveFeature(event) {
              if(i < Object.keys(lineDict).length){
                const time = event.frameState.time;
                const elapsedSeconds = (time - startTime)/1000;
                const line = lineDict[i]["line"];
                const speed = lineDict[i]["speed"];

                // speed is in m/s
                let distance = (speed * elapsedSeconds);

                //Find the coordinates using distance/line's length and set the markers to their new location
                const currentCoordinate = line.getCoordinateAt(distance/line.getLength());
                marker.setCoordinates(currentCoordinate);
                iconMarker.getGeometry().setCoordinates(currentCoordinate);
                const vectorContext = ol.render.getVectorContext(event);
                vectorContext.setStyle(style);
                vectorContext.drawGeometry(marker);

                //Iterate and reset distance after finishing animation of line
                if(distance > line.getLength()){
                  distance = 0;
                  startTime = Date.now();
                  i++;
                }
                //Continues the animation
                map.render();
              } 
            }
          };
          reader.readAsText(file);
          break;
      }
    }
  });
});