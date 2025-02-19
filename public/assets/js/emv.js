function chooseFile() {
  document.getElementById('qr-input-file').click();
}

/*
read QR from image
*/
const html5QrCode = new Html5Qrcode(/* element id */
"reader");

var f = null;
// File based scanning
const fileinput = document.getElementById('qr-input-file');

var __emvcoobj__ = null;
var __original__ = null;

fileinput.addEventListener('change', e => {
    if (e.target.files.length == 0) {
        // No file selected, ignore
        return;
    }

    // Use the first item in the list
    const imageFile = e.target.files[0];

    reduceImageSize(imageFile, (smallFile) => {
        // console.log("redueced image file");
        // console.log(smallFile);
        html5QrCode.scanFile(smallFile, /* showImage= */
        false).then(qrCodeMessage => {
            // success, use qrCodeMessage
            document.getElementById('code').value = qrCodeMessage;
            checkEmvCode();
        }
        ).catch(err => {
            // failure, handle it
            document.getElementById('formated').innerText = `Error scanning file. Reason: ${err}`;
            document.getElementById('qr').src = "";

        }
        );
    }

    );

}
);

/*
paste from clip board
*/
async function pasteImage() {
    try {
        const permission = await navigator.permissions.query({
            name: "clipboard-read",
        });
        if (permission.state === "denied") {
            throw new Error("Not allowed to read clipboard.");
        }
        const clipboardContents = await navigator.clipboard.read();
        for (const item of clipboardContents) {
            if (!item.types.includes("image/png")) {
                throw new Error("Clipboard contains non-image data.");
            }
            const blob = await item.getType("image/png");

            var file = new File([blob],"qr")
            html5QrCode.scanFile(file, /* showImage= */
            false).then(qrCodeMessage => {
                // success, use qrCodeMessage
                document.getElementById('code').value = qrCodeMessage;
                checkEmvCode();
            }
            ).catch(err => {
                // failure, handle it
                document.getElementById('formated').innerText = `Error scanning file. Reason: ${err}`;
                document.getElementById('qr').src = "";
                document.getElementById('code').value = "";

            }
            );
        }
    } catch (error) {
        //console.error(error.message);
        // failure, handle it
        document.getElementById('formated').innerText = error.message;
        document.getElementById('qr').src = "";
        document.getElementById('code').value = "";
    }
}

/*
reduce imageFile size
*/
function reduceImageSize(imageFile, onFinished) {
    var reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onloadend = function(e) {
        var image = new Image();
        image.src = e.target.result;
        image.onload = function(ev) {
            var canvas = document.getElementById('canvas');
            canvas.style.display = 'None';

            var aspectRatio = image.height / image.width;
            canvas.width = Math.min(300, image.width / 2);
            canvas.height = canvas.width * aspectRatio;

            var ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);

            canvas.toBlob( (blob) => {
                var file = new File([blob],"image.png");
                onFinished(file);
            }
            );
        }
    }
}

/*
decode emv code
*/
var result;
function checkEmvCode() {
    var code = document.getElementById('code').value;

    result = {
        'original': code,
        'emvobj': null,
        'error': 'success',
        'message': ''
    };

    //validate
    [result.original,result.error,result.message] = validateEmvCode(code);
    if (result.error == 'warning')
        document.getElementById('code').value = result.original;

    //parse
    result.emvobj = tlvDecode(code);

    //print
    if (result.error != 'error') {
      __emvcoobj__ = result.emvobj;
      __original__ = result.original;
      console.log(__emvcoobj__);
      displayEmvcoCode(__emvcoobj__, __original__);
    } else {
        document.getElementById('formated').innerText = result.message;
        document.getElementById('qr').src = "https://quickchart.io/chart?chs=220x220&cht=qr&chl=" + encodeURIComponent(result.original);
    }

    return result;
}

function displayEmvcoCode(emvobj, original) {
  document.getElementById('formated').replaceChildren(printTLV(emvobj, emvobj, emvobj));
  document.getElementById('qr').src = "https://quickchart.io/chart?chs=220x220&cht=qr&chl=" + encodeURIComponent(original);
}

function validateEmvCode(code) {
    //check if code is value
    if (code == '' || code.length < 10 || code.slice(-8, -4) != '6304') {
        return [code, "error", "not emv qr"];
    }

    //check crc
    var ori_crc = code.slice(-4);
    var calc_crc = crc16(code.slice(0, -4));

    if (ori_crc != calc_crc) {
        newcode = code.slice(0, -4) + calc_crc;
        return [newcode, "warning", `invalid CRC, shall be ${calc_crc}`];
    }

    return [code, "success", ""];
}

function emvobjCorrect(emvobj) {
  var correctItem = function(item) {
    if (typeof item.v == 'string') {
      return Number(item.l) + 4;
    }

    var result = 0;
    for (let i = 0; i < item.v.length; i++) {
      var childL = correctItem(item.v[i]);
      result += childL;
    }
    item.l = pad(result); 

    return result + 4;
  }

  for (let item of emvobj) {
    correctItem(item);
  }

  return emvobj
}

function emvobjToCode(emvobj) {
  var toCode = function(item) {
    if (typeof item.v == 'string') {
      return item.t + pad(item.l) + item.v;
    }

    var result = '';
    for (let i = 0; i < item.v.length; i++) {
      result += toCode(item.v[i])
    }

    return item.t + pad(item.l) + result;
  }

  var result = '';
  for (let item of emvobj) {
    if (item.t != '63') {
      result += toCode(item);
    } else {
      result += '6304' + crc16(result + '6304');
    }
  }

  return result
}

function tlvDecode(code) {
    var list = [];
    var offset = 0;
    while (offset < code.length) {
        var t = code.slice(offset + 0, offset + 2);
        var l = code.slice(offset + 2, offset + 4);

        if (isNaN(t) || isNaN(l) || Number(l) <= 0 || offset + 4 + Number(l) > code.length) {
            console.log("invalid tlv:" + code);
            return code;
            //invalid tlv, shall not parse it.
        }
        var length = Number(l);
        var v = code.slice(offset + 4, offset + 4 + length);

        offset = offset + 4 + length;
        v = tlvDecode(v);

        list.push({
            "t": t,
            "l": l,
            "v": v
        });
    }

    return list;
}

function pad(d) {
  if (typeof d == 'string') return d;
  return (d < 10) ? '0' + d.toString() : d.toString();
}

function reloadQR() {
  __emvcoobj__ = __emvcoobj__.sort((tagA, tagB) => {
    return tagA.t - tagB.t;
  })
  __emvcoobj__ = emvobjCorrect(__emvcoobj__);
  __original__ = emvobjToCode(__emvcoobj__);

  document.getElementById('code').value = __original__;

  checkEmvCode();
}

function printTLV(parentItem, item, tags, indent=0) {
    if (typeof tags == 'string') {
      var span = document.createElement('span');

      const handledbclick = (span) => function() {
        span.style.display = 'none';
        var input = document.createElement('input');
        input.value = span.innerText;

        input.onblur = function(e) {
          if (input.value !== item.v) {
            if (!input.value) {
              if (Array.isArray(parentItem)) {
                parentItem.splice(parentItem.indexOf(item), 1);
              } else {
                parentItem.v.splice(parentItem.v.indexOf(item), 1);
              }
            } else {
              item.v = input.value;
              item.l = input.value.length
            }

            reloadQR();
          } else {
            const newSpan = document.createElement('span');
            newSpan.innerText = item.v;
            newSpan.ondblclick = handledbclick(newSpan);

            input.replaceWith(newSpan);
          }
        }

        span.replaceWith(input);
        input.focus();
      };

      span.ondblclick = handledbclick(span);
      span.innerText = tags;

      return span;
    }

    var wrapper = document.createElement('div');

    for (var i = 0; i < tags.length; i++) {
        var item = tags[i];
        if (!item.v) break;
        var root = document.createElement('div');
        root.id = item.t;

        var second = document.createElement('span');
        second.innerText = " . . . ".repeat(indent);
        root.appendChild(second);

        var third = document.createElement('span');
        third.innerText = item.t + " " + item.l + " ";

        var aElement = document.createElement('a');
        aElement.innerText = '+';
        aElement.style.cursor = 'pointer';
        aElement.style.color = 'green';
        aElement.style.fontSize = '14px';
        aElement.style.fontWeight = '600';

        if (typeof item.v !== 'string') {
          var dElement = document.createElement('a');
          dElement.innerText = 'x';
          dElement.style.cursor = 'pointer';
          dElement.style.color = 'red';
          dElement.style.fontSize = '14px';
          dElement.style.fontWeight = '600';
        }

        root.appendChild(third);
        const childRoot = printTLV(typeof item.v != 'string' ? item : parentItem, item, item.v, indent + 1)
        root.appendChild(childRoot);

        const inputTag = document.createElement('input');
        inputTag.style.width = '30px';
        inputTag.setAttribute('maxlength', 2);
        const lengthTag = document.createElement('span');
        lengthTag.innerText = '--';
        const valueTag = document.createElement('input');
        const container = document.createElement('span');
        const indentTag = document.createElement('span');
        indentTag.innerText = " . . . ".repeat(typeof item.v != 'string' ? indent+1 : indent);

        const handleFinishInput = (parentItem, container, inputTag, lengthTag, valueTag) => () => {
          if (!inputTag.value && inputTag.value.length < 2 || !valueTag.value || valueTag.value.length === 0) {
            container.remove();
            return;
          }

          lengthTag.innerText = pad(valueTag.value.length);
          if (Array.isArray(parentItem)) {
            parentItem.push({ "t": inputTag.value, "l": lengthTag.innerText, "v": valueTag.value });
          } else {
            parentItem.v.push({ "t": inputTag.value, "l": lengthTag.innerText, "v": valueTag.value });
          }

          console.log(__emvcoobj__);
          reloadQR();
        }

        valueTag.onblur = handleFinishInput(typeof item.v === 'string' ? parentItem : item, container, inputTag, lengthTag, valueTag);


        container.appendChild(indentTag);
        container.appendChild(inputTag);
        container.appendChild(lengthTag);
        container.appendChild(valueTag);
        container.appendChild(document.createElement('br'));

        const handleClick = (item, inputTag) => () => {
          if (typeof item.v != 'string') {
            console.log('onclick');
            const firstNode = childRoot.childNodes[0];
            childRoot.insertBefore(container, firstNode);
            inputTag.focus();

            return;
          }

          let isCurrentNode = false;
          let nodeAfter = null;
          for (let node of root.parentNode.childNodes) {
            if (isCurrentNode) {
              nodeAfter = node;
              break;
            }

            if (node.id && node.id === item.t) {
              isCurrentNode = true;
              continue;
            }
          }

          root.parentNode.insertBefore(container, nodeAfter);
          inputTag.focus();
        }

        aElement.onclick = handleClick(item, inputTag);


        const handleDeleteClick = (item, inputTag) => () => {
          if (Array.isArray(parentItem)) {
            parentItem.splice(parentItem.indexOf(item), 1);
          } else {
            parentItem.v.splice(parentItem.v.indexOf(item), 1);
          }

          reloadQR();
        }

        if (typeof item.v != 'string') {
          dElement.onclick = handleDeleteClick(item, inputTag);
        }

        if (typeof item.v != 'string') {
          third.appendChild(aElement);
          const space = document.createElement('span');
          space.innerText = ' ';
          third.appendChild(space);
          third.appendChild(dElement);
          third.appendChild(document.createElement('br'));
        } else {
          const space = document.createElement('span');
          space.innerText = ' ';
          root.appendChild(space);
          root.appendChild(aElement);
          root.appendChild(document.createElement('br'));
        }

        wrapper.appendChild(root);
    }

    return wrapper;
}

function crc16(str) {
    var utf8enocder = new TextEncoder();
    var data = utf8enocder.encode(str);

    var crc = 0xFFFF;
    for (var i = 0; i < data.length; i++) {
        crc ^= data[i] << 8;
        for (var j = 0; j < 8; j++) {
            if ((crc & 0x8000) > 0)
                crc = (crc << 1) ^ 0x1021;
            else
                crc = crc << 1;

            crc &= 0xFFFF;
        }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
}


function genVNPayDeeplink() {
  var code = document.getElementById('code').value;
  checkEmvCode();
  if (result.error != 'success') {
    return;
  }

  var deeplink = `zalopay-vnpay://${encodeURIComponent(code)}?callbackurl=https%3A%2F%2Fexample.com`;
  document.getElementById('qr').src = "https://quickchart.io/chart?chs=220x220&cht=qr&chl=" + encodeURIComponent(deeplink); 
}

function openVNPayLink() {
  var code = document.getElementById('code').value;
  checkEmvCode();
  if (result.error != 'success') {
    return;
  }

  var deeplink = `https://socialdev.zalopay.vn/spa/v2/offline-qr/vnpay?qr=${encodeURIComponent(code)}&callbackurl=https%3A%2F%2Fexample.com`;
  window.open(deeplink);
}