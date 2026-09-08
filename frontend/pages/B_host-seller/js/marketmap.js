document.addEventListener('DOMContentLoaded', function () {
  kakao.maps.load(function () {
    var mapContainer = document.getElementById('map-container'),
      mapOption = {
        center: new kakao.maps.LatLng(37.566826, 126.978656),
        level: 3
      };

    var map = new kakao.maps.Map(mapContainer, mapOption);
    var geocoder = new kakao.maps.services.Geocoder();
    var marker = new kakao.maps.Marker({ position: map.getCenter(), map: map });

    function updateFullAddress() {
      if (!document.getElementById('address') || !document.getElementById('detailAddress')) {
        return;
      }
      console.log("눌림");
      var address = document.getElementById('address').value;
      var detail = document.getElementById('detailAddress').value;
      var combined = detail ? `${address} ${detail}` : address;
      document.getElementById('fullAddress').value = combined;
    }
    let isPostcodeOpen = false;
    const str = document.getElementById('button_hint');
    window.execDaumPostcode = function () {
      if (isPostcodeOpen) {
        str.textContent = "이미 우편번호 찾기 창이 열려 있어요.";
        str.style.color = "red";
        return;
      }
      isPostcodeOpen = true;
      new daum.Postcode({
        oncomplete: (data) => {
          var addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
          document.getElementById('postcode').value = data.zonecode;
          document.getElementById('address').value = addr;
          document.getElementById("detailAddress").focus();

          updateFullAddress();

          geocoder.addressSearch(addr, function (results, status) {
            if (status === kakao.maps.services.Status.OK) {
              var result = results[0];
              var coords = new kakao.maps.LatLng(result.y, result.x);

              mapContainer.style.display = "block";
              map.relayout();
              map.setCenter(coords);
              marker.setPosition(coords);

              document.getElementById('latitude').value = result.y;
              document.getElementById('longitude').value = result.x;
              document.getElementById('region').value = result.address.region_1depth_name;
            }
          });
        },
        onclose: () => {
          str.textContent = "";
          str.style.color = "black";
          isPostcodeOpen = false;
        }
      }).open();
    };

    document.getElementById('detailAddress').addEventListener('input', updateFullAddress);

    /**
     * [지도 위치 복원] 마켓 수정 화면에서 저장된 좌표로 지도를 옮깁니다.
     *
     *   예전에는 이 파일이 지도(map/marker)를 밖으로 내보내지 않아,
     *   수정 화면이 지도를 건드릴 방법이 아예 없었습니다.
     *   그래서 이미 주소가 있는 마켓을 수정하려고 열어도 지도는 **항상 서울시청**(기본값)
     *   에 머물렀고, 주소를 다시 검색하지 않으면 좌표가 그대로 남아
     *   "위치가 저장되지 않는" 것처럼 보였습니다.
     *
     *   marketcorrection.js 가 값을 채운 뒤 이 함수를 부릅니다.
     */
    window.MarketMap = {
      /**
       * 주소로 좌표를 찾아 채웁니다.
       *
       *   저장된 마켓에 좌표가 없거나 0 인 경우가 있습니다.
       *   (예전에 등록됐거나, 우편번호 검색 없이 저장된 마켓)
       *   그 상태로 두면 지도가 서울시청에 머물고, 저장할 때도 좌표가 비어 나갑니다.
       *   주소가 있으면 그것으로 다시 찾아 채웁니다.
       */
      geocode(address) {
        const addr = String(address || '').trim();
        if (!addr) return;
        geocoder.addressSearch(addr, function (results, status) {
          if (status !== kakao.maps.services.Status.OK || !results[0]) return;
          const r = results[0];
          const latEl = document.getElementById('latitude');
          const lngEl = document.getElementById('longitude');
          const regionEl = document.getElementById('region');
          if (latEl) latEl.value = r.y;
          if (lngEl) lngEl.value = r.x;
          // 지역이 비어 있을 때만 채웁니다. 이미 있으면 주최자가 정한 값을 존중합니다.
          if (regionEl && !regionEl.value && r.address) {
            regionEl.value = r.address.region_1depth_name;
          }
          window.MarketMap.moveTo(r.y, r.x);
        });
      },

      moveTo(lat, lng) {
        const y = Number(lat);
        const x = Number(lng);
        // 좌표가 없거나 0,0 이면 옮기지 않습니다. 아프리카 앞바다로 보내는 것보다
        // 기본 위치에 두는 편이 덜 혼란스럽습니다.
        if (!Number.isFinite(y) || !Number.isFinite(x) || (y === 0 && x === 0)) return false;

        const coords = new kakao.maps.LatLng(y, x);
        mapContainer.style.display = 'block';
        map.relayout();          // 숨겨진 상태로 그려졌으면 크기가 0 이라 다시 계산해야 합니다
        map.setCenter(coords);
        marker.setPosition(coords);
        return true;
      },
    };

    // 화면이 이미 좌표를 채워둔 뒤 이 스크립트가 늦게 로드될 수도 있습니다.
    // 그럴 때를 대비해 로드 직후 한 번 스스로 확인합니다.
    const latEl = document.getElementById('latitude');
    const lngEl = document.getElementById('longitude');
    if (latEl && lngEl && latEl.value && lngEl.value) {
      window.MarketMap.moveTo(latEl.value, lngEl.value);
    }
  });
});