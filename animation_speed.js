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


  const vectorContextStyle = new ol.style.Style({
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

  const iconStyle = new ol.style.Style({
    image: new ol.style.Icon({
      anchor: [.28, 1],
      src:  "https://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png",
    })
  })

  const incompletedStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: 'green',
      width: 2
    })
  });

  const completedStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: 'red',
      width: 4
    })
  });

  map.getViewport().addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  //This code takes a geojson of separate linestring features and uses their speed and number properties to get the speed and order of their animation.
  //NOTE: The properties of the features in the geojson should contain a speed value and a number value
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
            const sourceEPSG = getEPSGCode(geojsonData);

            const features = new ol.format.GeoJSON({
              dataProjection: sourceEPSG,
              featureProjection: "EPSG:3857"
            }).readFeatures(geojsonData);

            for(let key in features){
              if(features.hasOwnProperty(key)){
                let feature = features[key];
                feature.setStyle(incompletedStyle);
              }
            }

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

            iconMarker.setStyle(iconStyle);

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

            //Aggregate information about each line in its own entry in a dictionary 
            const lineDict = {};
            for(let i = 0; i < features.length; i++){
              //Get speed_values array and the linestrings for each segment
              const line = features[i].getGeometry();
              const speed = features[i].get("speed");
              const number = features[i].get("number");

              //Calculate the time it will take to traverse each segment
              const time = [];
              const segments = [];

              //seconds = distance/speed
              line.forEachSegment((start, end) => {
                let seg = new ol.geom.LineString([start, end]);
                segments.push(seg);

                let length = seg.getLength(); //in meters
                let seconds = length/speed;
                time.push(seconds);
              
              })
              lineDict[i] = {
                "line": line,
                "speed": speed,
                "number": number,
                "segment_times": time,
                "segments": segments
              };
            }

            //Create counter variables to track line completion
            let i = 0;
            let startTime = Date.now();

            //Initialize MultiLineString to hold all completed line segments
            const multiCompletedLine = new ol.Feature({
              geometry: new ol.geom.MultiLineString([])
            });
            multiCompletedLine.setStyle(completedStyle);
            vectorSource.addFeature(multiCompletedLine);

            //Initialize the temporary line that tracks the completed portion of a segment while animating 
            const completedLine = new ol.Feature({
              geometry: new ol.geom.LineString([])
            });
            completedLine.setStyle(completedStyle);
            vectorSource.addFeature(completedLine);

            //Change check for keys later. What if they aren't incrementing numbers? 
            let line = lineDict[0]["line"]
            let previousCoord = lineDict[0]["line"].getFirstCoordinate();
            let sectionCoord = previousCoord;
            completedLine.getGeometry().setCoordinates([previousCoord, previousCoord]);

            //Start the animation
            map.render();

            //Animates path that geojson lines follow. Traversed sections of line turn red as animation continues
            let segCount = secondSum = 0;
            const keys = Object.keys(lineDict);
            function moveFeature(event) {
              if(i < keys.length){
                const time = event.frameState.time;
                const elapsedSeconds = (time - startTime)/1000;
                const speed = lineDict[keys[i]]["speed"];
                const segmentTimes = lineDict[keys[i]]["segment_times"];
                const segments = lineDict[keys[i]]["segments"];

                // speed is in m/s
                let distance = (speed * elapsedSeconds);

                //Find the coordinates using distance/line's length and set the markers to their new location
                const currentCoord = line.getCoordinateAt(distance/line.getLength());
                marker.setCoordinates(currentCoord);
                iconMarker.getGeometry().setCoordinates(currentCoord);
                const vectorContext = ol.render.getVectorContext(event);
                vectorContext.setStyle(vectorContextStyle);
                vectorContext.drawGeometry(marker);
                completedLine.getGeometry().setCoordinates([sectionCoord, currentCoord]);

                //Use the calculated time to finish traversing a line segment to append to the multiLineString geometry holding completed line segments
                if(elapsedSeconds - secondSum > segmentTimes[segCount]){
                  //Keep a running sum for times to check against time for completion of each segment
                  secondSum += segmentTimes[segCount];
                  sectionCoord = segments[segCount].getCoordinates()[1]
                  multiCompletedLine.getGeometry().appendLineString(segments[segCount]);
                  segCount++;
                }

                //If line has been fully traversed
                if(distance > line.getLength()){
                  distance = j = 0;
                  startTime = Date.now();
                  i++;
                  //Add segment to completed line segment geometry
                  if(segCount < segments.length){
                    multiCompletedLine.getGeometry().appendLineString(segments[segCount]);
                  }
                  segCount = secondSum = 0;

                  //Get the next line
                  if(i < Object.keys(lineDict).length){
                    line = lineDict[i]["line"];
                    previousCoord = sectionCoord = line.getFirstCoordinate();
                    completedLine.getGeometry().setCoordinates([previousCoord, previousCoord]);
                  } else {
                    //Remove the completedLine and iconMarker from view
                    completedLine.getGeometry().setCoordinates([]);
                    iconMarker.getGeometry().setCoordinates([])
                  }
                }

                previousCoord = currentCoord;

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

  //Gets the EPSG code from a geojson if it's there. Else, default to EPSG:4326
  function getEPSGCode(json){
    const reg = RegExp("EPSG:\\d+")
    let sourceCRS = json.crs ? json.crs.properties.name : "EPSG:4326";
    if(sourceCRS == "EPSG:4326"){
      return sourceCRS
    } 
    const cleanCRS = sourceCRS.replace(/:+/g, ":");
    const epsgIndex = cleanCRS.search(reg);
    if(epsgIndex == -1){
      return "EPSG:4326"
    }

    const epsg = cleanCRS.match(reg)[0];
    return epsg;
  }
});