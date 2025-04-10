# Projeto DIGITO.pt


<details>
<summary>Old archive.org PHP script</summary>

Based on this first PHP code:

```php
<?php
$ga = <<<EOF
<script src="https://code.jquery.com/jquery-1.11.1.min.js"></script>
<script>
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-97411-9', 'auto');
ga('send', 'pageview');

$(document).ready(function() {
    try {
        $('#wm-ipp-inside').find('td.r a[href="#close"]').click();
    } catch(err) {}

    $('a').on('click', function(e) {
        e.preventDefault();
        var url = $(this).prop('href').split('http://www.digito.pt');
        if ( url[1] ) {
            window.location.href=url[1];
        }
    });
});
</script>
</body>
EOF;

if ( $_SERVER['REQUEST_URI'] == '/' or $_SERVER['REQUEST_URI'] == '/index.html' ) {
    $wayUrl = 'http://web.archive.org/web/20030203134017/http://www.digito.pt/index.html';
} else {
    $wayJson = file_get_contents('http://archive.org/wayback/available?url=http://www.digito.pt' . $_SERVER['REQUEST_URI']);
    $wayArray = json_decode($wayJson, true);
    if ( !empty($wayArray['archived_snapshots']['closest']) ) {
        $wayUrl = $wayArray['archived_snapshots']['closest']['url'];
    }
}
if ( !empty($wayUrl) ) {
    $html = file_get_contents($wayUrl);
    $html = str_replace(array(
            '"/web/',
            '"/static/',
            '</body>'
        ), array(
            '"http://web.archive.org/web/',
            '"http://web.archive.org/static/',
            $ga
        ), $html
    );
    echo $html;
}
```
</details>